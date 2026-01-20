import { config } from "../util/config.js";
import logger, { LogColor } from "../util/logger.js";
import { openaiConnector } from "../connect/openai.js";
import { formatCandlesWithEma } from "../util/format.js";
import { Candle } from "../model/candle.js";
import { LLMAnalysisResult } from "../model/llm_result.js";
import { okxExchange, OKXExchange } from "../connect/exchange.js";
import { calculateATRPercentage } from "../util/indicator.js";
import { readHistory } from "../util/history_manager.js";

/**
 * 分析图像
 * @param interval 时间周期
 * @param imageUrl 图像URL
 * @returns 分析结果
 */
export async function analyzeImage(interval: string, imageUrl: string) {
  const systemPrompt = config.system_prompt.visual;
  const userPrompt = `这是${interval}周期的k线图表。`;

  const analysis = await openaiConnector.analyzeImage(
    systemPrompt,
    userPrompt,
    imageUrl,
  );
  return analysis;
}

/**
 * 分析OHLCV数据
 * @param interval 时间周期
 * @param ohlcv K线数据
 * @param ema EMA数据
 * @returns 分析结果
 */
export async function analyzeOHLCV(
  interval: string,
  ohlcv: Candle[],
  ema: (number | null)[],
) {
  const systemPrompt = config.system_prompt.simple_analysis;
  const formatData = formatCandlesWithEma(ohlcv, ema);
  const userPrompt = `以下为${interval}周期的ohlcv+ema数据。\n` + formatData;

  const analysis = await openaiConnector.chat(
    systemPrompt,
    userPrompt,
    config.llm.simple_analysis_model,
  );
  return analysis;
}

/**
 * 分析风险
 * @param symbol 交易对
 * @returns 分析结果
 */
export async function analyzeRisk(symbol: string, candels: Candle[]) {
  //获取余额
  const balance = await okxExchange.getBalance();
  const total = balance.getTotal();
  const balanceText = `当前账户总权益为${total}，可用余额为${balance.getFree()}。\n`;
  //获取持仓
  const positions = await okxExchange.getPositions("SWAP", symbol);
  let positionText = ``;
  if (positions.length > 0) {
    const position = positions[0];
    // 格式化position数据
    positionText = position.toString() + "\n";
  } else {
    positionText = `当前无${symbol}的持仓。\n`;
  }

  // 获取止损单信息
  let slText = ``;
  try {
    const algoOrders = await okxExchange.getPendingAlgoOrders(symbol, "oco");
    const conditionalOrders = await okxExchange.getPendingAlgoOrders(
      symbol,
      "conditional",
    );
    const allOrders = [...algoOrders, ...conditionalOrders];

    const slOrders = allOrders.filter(
      (order: any) => order.slTriggerPx && parseFloat(order.slTriggerPx) > 0,
    );

    if (slOrders.length > 0) {
      // 可能有多个止损单，列出所有
      const slPrices = slOrders.map((o: any) => o.slTriggerPx).join(", ");
      slText = `当前存在的止损单触发价格为: ${slPrices}。\n`;
    } else {
      slText = `当前未设置止损单。\n`;
    }
  } catch (e) {
    slText = `获取止损单信息失败。\n`;
  }

  // 组合分析文本
  const analysisText = balanceText + positionText + slText;

  const analysis = openaiConnector.chat(
    config.system_prompt.risk_analysis,
    analysisText,
    config.llm.risk_analysis_model,
  );

  return analysis;
}

export async function decision(
  all_analysis: string,
): Promise<LLMAnalysisResult> {
  // 读取历史记录
  const history = readHistory();
  let historyText = "";
  if (history) {
    historyText = `\n\n### 历史决策记录 (供参考，按时间从旧到新):\n${history}\n`;
  }

  const baseContext =
    `请根据以下分析内容进行决策，用户设置的单笔风险为${config.trade.risk}%。\n` +
    historyText +
    `\n### 当前分析报告:\n` +
    all_analysis;

  // 1. Proposer (决策发起者)
  logger.info("正在获取 Proposer (决策发起者) 的建议...", {
    color: LogColor.Cyan,
  });
  const proposalJson = await openaiConnector.chatWithJson(
    config.system_prompt.main,
    baseContext,
  );
  const proposalResult = new LLMAnalysisResult(proposalJson);
  logger.info(`Proposer 建议: ${proposalResult.toString()}`, {
    color: LogColor.Cyan,
  });

  // 2. Reviewer (风控审查员)
  logger.info("正在获取 Reviewer (风控审查员) 的审查意见...", {
    color: LogColor.Magenta,
  });
  const reviewContext =
    baseContext +
    `\n\n### 决策发起者 (Proposer) 的建议:\n${JSON.stringify(proposalJson, null, 2)}`;

  const reviewJson = await openaiConnector.chatWithJson(
    config.system_prompt.reviewer,
    reviewContext,
  );
  const reviewResult = new LLMAnalysisResult(reviewJson);
  logger.info(`Reviewer 意见: ${reviewResult.toString()}`, {
    color: LogColor.Magenta,
  });

  // 3. Arbiter (首席裁决官)
  logger.info("正在获取 Arbiter (首席裁决官) 的最终裁决...", {
    color: LogColor.Yellow,
  });
  const arbiterContext =
    reviewContext +
    `\n\n### 风控审查员 (Reviewer) 的审查意见:\n${JSON.stringify(reviewJson, null, 2)}`;

  const arbiterJson = await openaiConnector.chatWithJson(
    config.system_prompt.arbiter,
    arbiterContext,
    config.llm.arbiter_model,
  );
  const arbiterResult = new LLMAnalysisResult(arbiterJson);
  logger.info(`Arbiter 最终裁决: ${arbiterResult.toString()}`, {
    color: LogColor.Green,
  });

  return arbiterResult;
}

/**
 * 压缩决策记录
 * @param all_analysis 所有的分析内容
 * @param decisionResult 最终决策结果
 */
export async function compressDecision(
  all_analysis: string,
  decisionResult: LLMAnalysisResult,
): Promise<string> {
  const systemPrompt = config.system_prompt.compress;
  const userPrompt = `请根据以下详细分析和最终决策，生成一条精简的压缩记录。\n\n分析内容:\n${all_analysis}\n\n最终决策:\n${decisionResult.toString()}`;

  const compressed = await openaiConnector.chat(
    systemPrompt,
    userPrompt,
    config.llm.compress_llm,
  );

  // 添加时间戳
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);
  return `${now} ${compressed}`;
}

