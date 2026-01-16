import { config } from "../util/config.js";
import logger from "../util/logger.js";
import { getCandles } from "../connect/market.js";
import { parentPort, workerData, isMainThread } from "worker_threads";
import { drawKLineChartLWC } from "../util/draw_lwc.js";
import { calculateEMA } from "../util/indicator.js";

// 获取k线周期配置参数
const microInterval = config.candle.micro_interval;
const tradeInterval = config.candle.trade_interval;
const macroInterval = config.candle.macro_interval;
const microIntervalCount = config.candle.micro_interval_count;
const tradeIntervalCount = config.candle.trade_interval_count;
const macroIntervalCount = config.candle.macro_interval_count;
const imageCandleCount = config.candle.image_candle_count;
const emaPeriod = config.indicator.ema;

let microCandles: Candle[] = [];
let tradeCandles: Candle[] = [];
let macroCandles: Candle[] = [];
/**
 * 将时间间隔字符串转换为毫秒数
 * @param interval 例如 "1m", "4h", "1d"
 */
function getIntervalMs(interval: string): number {
  const unit = interval.slice(-1);
  const value = parseInt(interval.slice(0, -1));

  if (isNaN(value)) {
    throw new Error(`无法解析时间间隔数值: ${interval}`);
  }

  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
    case "H":
      return value * 60 * 60 * 1000;
    case "d":
    case "D":
      return value * 24 * 60 * 60 * 1000;
    case "w":
    case "W":
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`不支持的时间单位: ${unit}`);
  }
}

/**
 * 策略主运行循环
 * @param symbol 交易对名称
 */
export async function runStrategy(symbol: string) {
  try {
    const tradeInterval = config.candle.trade_interval;
    logger.info(`[${symbol}] 启动策略循环，交易周期: ${tradeInterval}`);

    const intervalMs = getIntervalMs(tradeInterval);

    // 首次运行时，计算距离下一个周期的等待时间
    // 例如 1m 周期，当前 12:00:10，则等到 12:01:00 (K线收盘/新K线开盘)
    // 为了确保K线已收盘，我们通常在整点过一点点执行，或者就在整点执行

    while (true) {
      const now = Date.now();
      // 计算下一个整点时间
      // Math.floor(now / intervalMs) * intervalMs 是当前周期的起始时间
      // + intervalMs 是下一个周期的起始时间
      let nextRunTime = (Math.floor(now / intervalMs) + 1) * intervalMs;

      // 添加一点点延迟（例如 1秒），确保交易所K线数据已生成
      // nextRunTime += 1000;

      let waitTime = nextRunTime - now;

      // 如果计算出的等待时间异常（理论上不会，因为用的 +1），进行修正
      if (waitTime <= 0) {
        waitTime = intervalMs;
      }

      logger.info(
        `[${symbol}] 等待下一次 ${tradeInterval} K线收盘... 预计等待 ${(
          waitTime / 1000
        ).toFixed(1)} 秒`
      );

      await new Promise(resolve => setTimeout(resolve, waitTime));

      // 唤醒后执行操作
      try {
        // TODO: 在这里调用分析模块和交易模块
        logger.info(`[${symbol}] 开始执行策略分析...`);
        // 调用交易逻辑函数
        await strategyCore(symbol);

        logger.info(`[${symbol}] 策略周期 ${tradeInterval} 执行完毕`);
      } catch (err) {
        logger.error(`[${symbol}] 策略执行周期内发生错误:`, err);
        // 出错后不中断循环，继续下一次
      }
    }
  } catch (error) {
    logger.error(`[${symbol}] 策略主循环发生致命错误:`, error);
    process.exit(1);
  }
}

async function strategyCore(symbol: string) {
  logger.info(`[${symbol}] 开始执行交易主逻辑.`);
  //重置数组内容
  macroCandles = [];
  tradeCandles = [];
  microCandles = [];

  //一次性获取所有k线数据，包括图像生成所需的额外k线
  try {
    const [microCandles, tradeCandles, macroCandles] = await Promise.all([
      getCandles(symbol, microInterval, microIntervalCount + imageCandleCount),
      getCandles(symbol, tradeInterval, tradeIntervalCount + imageCandleCount),
      getCandles(symbol, macroInterval, macroIntervalCount + imageCandleCount),
    ]);
  } catch (err) {
    logger.error(`[${symbol}] 获取k线数据失败，跳过本轮收盘:`, err);
  }
  //剔除首个数据，因为首个数据是刚开盘的k线，而不是已收盘的
  tradeCandles.shift();
  macroCandles.shift();
  microCandles.shift();

    // 分析micro周期
    const micro_ema = calculateEMA(microCandles, emaPeriod);
    const micro_image = drawKLineChartLWC(microCandles, micro_ema, microInterval);
    
}

// 如果直接运行此文件
import { fileURLToPath } from "url";
import { Candle } from "../model/candle.js";
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (!isMainThread) {
  // Worker 线程模式
  const { symbol } = workerData;
  if (symbol) {
    runStrategy(symbol);
  } else {
    logger.error("Worker 线程未接收到 symbol 参数");
  }
} else if (isMainModule) {
  // 命令行直接运行模式
  const symbol = process.argv[2] || config.trade.symbols[0];
  if (symbol) {
    runStrategy(symbol);
  } else {
    logger.error("未指定 symbol，且配置中无默认 symbol");
  }
}
