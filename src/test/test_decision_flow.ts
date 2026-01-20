import fs from "fs";
import path from "path";
import { config } from "../util/config.js";
import logger, { LogColor } from "../util/logger.js";
import { getCandles } from "../connect/market.js";
import { drawKLineChartLWC } from "../util/draw_lwc.js";
import { calculateEMA } from "../util/indicator.js";
import {
  analyzeImage,
  analyzeOHLCV,
  analyzeRisk,
  decision,
} from "../core/analyze_functions.js";
import { readHistory } from "../util/history_manager.js";
import { Candle } from "../model/candle.js";
import { closeBrowser } from "../util/puppeteer_instance.js";

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

const emaPeriod = config.indicator.ema;
const imageCandleCount = config.candle.image_candle_count;

/**
 * 分析单个周期的数据
 */
async function analyzeInterval(
  symbol: string,
  conf: IntervalConfig,
  candles: Candle[],
): Promise<IntervalAnalysisResult> {
  const { interval, count } = conf;

  logger.info(`[${symbol}] 开始分析 ${interval} 周期数据...`, {
    color: "yellow",
  });

  const ema = calculateEMA(candles, emaPeriod);
  const image = await drawKLineChartLWC(candles, ema, interval);

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
  return `\`\`\`yaml\n${result.interval}interval:\n  imageAnalysis: ${result.imageAnalysis}\n  dataAnalysis: ${result.dataAnalysis}\n\`\`\``;
}

/**
 * 测试主流程：获取数据 -> 并行分析 -> 最终决策 (不执行交易)
 */
async function testDecisionFlow(symbol: string) {
  logger.info(`开始测试交易决策流程，交易对: ${symbol}`, { color: LogColor.Blue });

  const intervalConfigs: IntervalConfig[] = [
    { name: "micro", interval: config.candle.micro_interval, count: config.candle.micro_interval_count },
    { name: "trade", interval: config.candle.trade_interval, count: config.candle.trade_interval_count },
    { name: "macro", interval: config.candle.macro_interval, count: config.candle.macro_interval_count },
  ];

  // 1. 获取 K 线数据 (G节点)
  logger.info(`[${symbol}] 1. 获取多周期 K 线数据...`);
  const candlesResults = await Promise.all(
    intervalConfigs.map(conf =>
      getCandles(symbol, conf.interval, conf.count + imageCandleCount),
    ),
  );

  const candlesMap = new Map<string, Candle[]>(
    intervalConfigs.map((conf, index) => {
      const candles = candlesResults[index];
      candles.shift(); // 剔除未收盘数据
      return [conf.name, candles];
    }),
  );

  // 2. 并行分析 (H/I节点)
  logger.info(`[${symbol}] 2. 开始并行分析各周期及风险...`);

  let riskAnalysisText = "";
  try {
    const [microResult, tradeResult, macroResult, riskAnalysis] = await Promise.all([
      analyzeInterval(symbol, intervalConfigs[0], candlesMap.get("micro")!),
      analyzeInterval(symbol, intervalConfigs[1], candlesMap.get("trade")!),
      analyzeInterval(symbol, intervalConfigs[2], candlesMap.get("macro")!),
      analyzeRisk(symbol, candlesMap.get("trade")!).catch(err => {
        logger.warn(`[${symbol}] 风险分析失败 (可能是 IP 白名单限制)，将使用默认风险提示: ${err.message}`);
        return "无法获取实时账户风险数据，请基于常规风险管理原则决策。";
      }),
    ]);

    const analysisResults = [microResult, tradeResult, macroResult];
    riskAnalysisText = `\`\`\`yaml\nriskAnalysis:\n  ${riskAnalysis}\n\`\`\``;

    // 3. 汇总并进行决策 (L节点)
    const allAnalysis = [
      ...analysisResults.map(formatAnalysisResult),
      riskAnalysisText,
    ].join("\n");

    const history = readHistory();
    let historyText = "";
    if (history) {
      historyText = `\n\n### 历史决策记录 (供参考，按时间从旧到新):\n${history}\n`;
    }

    const finalUserPrompt =
      `请根据以下分析内容进行最终决策，用户设置的单笔风险为${config.trade.risk}%。\n` +
      historyText +
      `\n### 当前分析报告:\n` +
      allAnalysis;

    logger.info(`[${symbol}] 3. 调用 LLM 进行最终决策...`);
    const decisionResult = await decision(allAnalysis);

    // 4. 记录结果到 output 目录
    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const timestamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    const fileName = `decision_test_${symbol}_${timestamp}.md`;
    const filePath = path.join(outputDir, fileName);

    const mdContent = `# 交易决策流程测试报告\n\n` +
      `- **交易对**: ${symbol}\n` +
      `- **测试时间**: ${new Date().toLocaleString()}\n\n` +
      `## LLM 系统提示词 (System Prompt)\n\n` +
      `\`\`\`text\n${config.system_prompt.main}\n\`\`\`\n\n` +
      `## LLM 输入内容 (User Prompt)\n\n` +
      `${finalUserPrompt}\n\n` +
      `## LLM 最终决策 (Output)\n\n` +
      `\`\`\`json\n${JSON.stringify(decisionResult, null, 2)}\n\`\`\`\n\n` +
      `---报告生成完毕---`;

    fs.writeFileSync(filePath, mdContent, "utf-8");
    logger.info(`测试完成，结果已保存至: ${filePath}`, { color: LogColor.Green });
  } catch (err) {
    logger.error("分析过程中发生错误:", err);
    throw err;
  } finally {
    // 关闭浏览器实例，确保程序能自动退出
    await closeBrowser();
  }
}

// 执行测试
const testSymbol = process.argv[2] || config.trade.symbols[0] || "BTC-USDT-SWAP";
testDecisionFlow(testSymbol).catch(err => {
  logger.error("测试流程发生致命错误:", err);
  process.exit(1);
});
