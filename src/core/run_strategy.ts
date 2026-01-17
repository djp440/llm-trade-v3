import { config } from "../util/config.js";
import logger, { LogColor } from "../util/logger.js";
import { getCandles } from "../connect/market.js";
import { parentPort, workerData, isMainThread } from "worker_threads";
import { drawKLineChartLWC } from "../util/draw_lwc.js";
import { calculateEMA } from "../util/indicator.js";
import {
  analyzeImage,
  analyzeOHLCV,
  analyzeRisk,
  decision,
} from "./strategy_functions.js";

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
    case "M":
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
        ).toFixed(1)} 秒`,
        { color: LogColor.Blue }
      );

      await new Promise(resolve => setTimeout(resolve, waitTime));

      // 唤醒后执行操作
      try {
        // TODO: 在这里调用分析模块和交易模块
        logger.info(`[${symbol}] 开始执行策略分析...`, {
          color: LogColor.Blue,
        });
        // 调用分析函数
        const decisionResult = await getDecision(symbol);

        logger.info(`[${symbol}] 策略周期 ${tradeInterval} 执行完毕`, {
          color: LogColor.Blue,
        });
      } catch (err) {
        logger.error(`[${symbol}] 策略执行周期内发生错误:`, err, {
          color: LogColor.Blue,
        });
        // 出错后不中断循环，继续下一次
      }
    }
  } catch (error) {
    logger.error(`[${symbol}] 策略主循环发生致命错误:`, error);
    process.exit(1);
  }
}

//======================================================================================
// TODO: 修复dataAnalysis的时间轴幻觉
/**
 * 交易主逻辑
 * @param symbol 交易对名称
 */
async function getDecision(symbol: string) {
  logger.info(`[${symbol}] 开始执行交易主逻辑.`);
  //重置数组内容
  macroCandles = [];
  tradeCandles = [];
  microCandles = [];

  //一次性获取所有k线数据，包括图像生成所需的额外k线
  try {
    [microCandles, tradeCandles, macroCandles] = await Promise.all([
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
  logger.info(`[${symbol}] 开始分析${microInterval}周期数据...`, {
    color: "yellow",
  });
  const micro_ema = calculateEMA(microCandles, emaPeriod);
  const micro_image = await drawKLineChartLWC(
    microCandles,
    micro_ema,
    microInterval
  );
  let microImageAnalysis, microOHLCVAnalysis;
  try {
    [microImageAnalysis, microOHLCVAnalysis] = await Promise.all([
      analyzeImage(microInterval, micro_image),
      analyzeOHLCV(
        microInterval,
        microCandles.slice(1, microIntervalCount + 1),
        micro_ema
      ),
    ]);
  } catch (e) {
    logger.error(`[${symbol}] 分析${microInterval}周期失败，跳过本轮收盘:`, e);
  }
  const microAnalysis = `
  \`\`\`yaml\n
  ${microInterval}interval:\n
  \timageAnalysis: ${microImageAnalysis}\n
  \tdataAnalysis: ${microOHLCVAnalysis}\n
  \`\`\`
  `;
  logger.info(`[${symbol}] ${microInterval}周期分析结果: \n${microAnalysis}`, {
    color: "green",
  });

  //分析trade周期
  logger.info(`[${symbol}] 开始分析${tradeInterval}周期数据...`, {
    color: "yellow",
  });
  const trade_ema = calculateEMA(tradeCandles, emaPeriod);
  const trade_image = await drawKLineChartLWC(
    tradeCandles,
    trade_ema,
    tradeInterval
  );
  let tradeImageAnalysis, tradeOHLCVAnalysis;
  try {
    [tradeImageAnalysis, tradeOHLCVAnalysis] = await Promise.all([
      analyzeImage(tradeInterval, trade_image),
      analyzeOHLCV(
        tradeInterval,
        tradeCandles.slice(1, tradeIntervalCount + 1),
        trade_ema
      ),
    ]);
  } catch (e) {
    logger.error(`[${symbol}] 分析${tradeInterval}周期失败，跳过本轮收盘:`, e);
  }
  const tradeAnalysis = `
  \`\`\`yaml\n
  ${tradeInterval}interval:\n
  \timageAnalysis: ${tradeImageAnalysis}\n
  \tdataAnalysis: ${tradeOHLCVAnalysis}\n
  \`\`\`
  `;
  logger.info(`[${symbol}] ${tradeInterval}周期分析结果: \n${tradeAnalysis}`, {
    color: "green",
  });

  //分析macro周期
  logger.info(`[${symbol}] 开始分析${macroInterval}周期数据...`, {
    color: "yellow",
  });
  const macro_ema = calculateEMA(macroCandles, emaPeriod);
  const macro_image = await drawKLineChartLWC(
    macroCandles,
    macro_ema,
    macroInterval
  );
  let macroImageAnalysis, macroOHLCVAnalysis;
  try {
    [macroImageAnalysis, macroOHLCVAnalysis] = await Promise.all([
      analyzeImage(macroInterval, macro_image),
      analyzeOHLCV(
        macroInterval,
        macroCandles.slice(1, macroIntervalCount + 1),
        macro_ema
      ),
    ]);
  } catch (e) {
    logger.error(`[${symbol}] 分析${macroInterval}周期失败，跳过本轮收盘:`, e);
  }
  const macroAnalysis = `
  \`\`\`yaml\n
  ${macroInterval}interval:\n
  \timageAnalysis: ${macroImageAnalysis}\n
  \tdataAnalysis: ${macroOHLCVAnalysis}\n
  \`\`\`
  `;
  logger.info(`[${symbol}] ${macroInterval}周期分析结果: \n${macroAnalysis}`, {
    color: "green",
  });

  //分析账户风险
  logger.info(`[${symbol}] 开始分析账户风险...`, {
    color: "yellow",
  });
  const riskAnalysis = await analyzeRisk(symbol);
  const riskAnalysisText = `
  \`\`\`yaml
  riskAnalysis:
  \t${riskAnalysis}
  \`\`\`
  `;
  logger.info(`[${symbol}] 账户风险分析结果: \n${riskAnalysisText}`, {
    color: "green",
  });

  // 合并所有分析结果
  const allAnalysis = `${microAnalysis}${tradeAnalysis}${macroAnalysis}${riskAnalysisText}`;

  //进行最终决策
  logger.info(`[${symbol}] 进行最终决策...`, {
    color: "yellow",
  });
  const decisionResult = await decision(allAnalysis);
  logger.info(
    `[${symbol}] 本轮最终决策: ${JSON.stringify(decisionResult, null, 2)}`,
    { color: "green" }
  );
  return decisionResult;
}

//======================================================================================

// 如果直接运行此文件
import { fileURLToPath } from "url";
import { Candle } from "../model/candle.js";
import { color } from "echarts/types/dist/core";
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
