import { config } from "../util/config.js";
import logger, { LogColor } from "../util/logger.js";
import { getCandles } from "../connect/market.js";
import { parentPort, workerData, isMainThread } from "worker_threads";
import { drawKLineChartLWC } from "../util/draw_lwc.js";
import { calculateEMA } from "../util/indicator.js";
import { withRetry } from "../util/retry.js";
import { trade } from "./trade_functions.js";
import {
  analyzeImage,
  analyzeOHLCV,
  analyzeRisk,
  decision,
} from "./analyze_functions.js";

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
        { color: LogColor.Blue },
      );

      await new Promise(resolve => setTimeout(resolve, waitTime));

      // 唤醒后执行操作
      try {
        // TODO: 在这里调用分析模块和交易模块
        logger.info(`[${symbol}] 开始执行策略分析...`, {
          color: LogColor.Blue,
        });
        // 调用分析函数
        const decisionResult = await withRetry(() => getDecision(symbol), {
          maxRetries: 3,
          delay: 2000,
          context: `${symbol} 策略分析`,
        });
        // 调用交易函数
        await withRetry(() => trade(symbol, decisionResult), {
          maxRetries: 5,
          delay: 2000,
          context: `${symbol} 下单交易`,
        });

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

/**
 * 周期配置类型
 */
interface IntervalConfig {
  name: string;
  interval: string;
  count: number;
}

/**
 * 周期分析结果类型
 */
interface IntervalAnalysisResult {
  interval: string;
  imageAnalysis: string;
  dataAnalysis: string;
}

/**
 * 分析单个周期的数据
 * 抽取重复逻辑为独立函数
 */
async function analyzeInterval(
  symbol: string,
  config: IntervalConfig,
  candles: Candle[],
  imageCandleCount: number,
): Promise<IntervalAnalysisResult> {
  const { interval, count } = config;

  logger.info(`[${symbol}] 开始分析${interval}周期数据...`, {
    color: "yellow",
  });

  // 计算 EMA 和绘制图表可以并行
  const ema = calculateEMA(candles, emaPeriod);
  const image = await drawKLineChartLWC(candles, ema, interval);

  // 图像分析和 OHLCV 分析并行执行
  const [imageAnalysis, dataAnalysis] = await Promise.all([
    analyzeImage(interval, image),
    analyzeOHLCV(interval, candles.slice(1, count + 1), ema),
  ]);

  return { interval, imageAnalysis, dataAnalysis };
}

/**
 * 格式化分析结果为 YAML 字符串
 */
function formatAnalysisResult(result: IntervalAnalysisResult): string {
  return `\`\`\`yaml
${result.interval}interval:
  imageAnalysis: ${result.imageAnalysis}
  dataAnalysis: ${result.dataAnalysis}
\`\`\``;
}

/**
 * 交易主逻辑（优化版）
 * @param symbol 交易对名称
 */
async function getDecision(symbol: string) {
  logger.info(`[${symbol}] 开始执行交易主逻辑.`);

  // 定义周期配置
  const intervalConfigs: IntervalConfig[] = [
    { name: "micro", interval: microInterval, count: microIntervalCount },
    { name: "trade", interval: tradeInterval, count: tradeIntervalCount },
    { name: "macro", interval: macroInterval, count: macroIntervalCount },
  ];

  // ========== 第一阶段：并行获取所有 K 线数据 ==========
  let candlesMap: Map<string, Candle[]>;

  try {
    const candlesResults = await Promise.all(
      intervalConfigs.map(config =>
        getCandles(symbol, config.interval, config.count + imageCandleCount),
      ),
    );

    // 剔除首个未收盘的 K 线，并存入 Map
    candlesMap = new Map(
      intervalConfigs.map((config, index) => {
        const candles = candlesResults[index];
        candles.shift(); // 剔除未收盘数据
        return [config.name, candles];
      }),
    );
  } catch (err) {
    logger.error(`[${symbol}] 获取K线数据失败，跳过本轮收盘:`, err);
    throw err; // 提前返回，避免后续使用 undefined
  }

  // ========== 第二阶段：并行分析所有周期 + 账户风险 ==========
  try {
    // 🚀 关键优化：所有分析任务完全并行执行
    const [microResult, tradeResult, macroResult, riskAnalysis] =
      await Promise.all([
        analyzeInterval(
          symbol,
          intervalConfigs[0],
          candlesMap.get("micro")!,
          imageCandleCount,
        ),
        analyzeInterval(
          symbol,
          intervalConfigs[1],
          candlesMap.get("trade")!,
          imageCandleCount,
        ),
        analyzeInterval(
          symbol,
          intervalConfigs[2],
          candlesMap.get("macro")!,
          imageCandleCount,
        ),
        analyzeRisk(symbol, candlesMap.get("trade")!), // 风险分析也并行执行
      ]);

    // 格式化并输出结果
    const analysisResults = [microResult, tradeResult, macroResult];

    for (const result of analysisResults) {
      const formatted = formatAnalysisResult(result);
      logger.info(`[${symbol}] ${result.interval}周期分析结果:\n${formatted}`, {
        color: "green",
      });
    }

    const riskAnalysisText = `\`\`\`yaml
riskAnalysis:
  ${riskAnalysis}
\`\`\``;
    logger.info(`[${symbol}] 账户风险分析结果:\n${riskAnalysisText}`, {
      color: "green",
    });

    // ========== 第三阶段：最终决策 ==========
    const allAnalysis = [
      ...analysisResults.map(formatAnalysisResult),
      riskAnalysisText,
    ].join("\n");

    logger.info(`[${symbol}] 进行最终决策...`, { color: "yellow" });
    const decisionResult = await decision(allAnalysis);

    logger.info(`[${symbol}] 本轮最终决策: ${decisionResult.toString()}`, {
      color: "green",
    });

    return decisionResult;
  } catch (err) {
    logger.error(`[${symbol}] 分析过程失败:`, err);
    throw err;
  }
}

// 如果直接运行此文件
import { fileURLToPath } from "url";
import { Candle } from "../model/candle.js";
import { color } from "echarts/types/dist/core";
// import { trade } from "./trade_functions.js"; // 已移动到顶部引用
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
