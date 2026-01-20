import { config } from "../util/config.ts";
import { openaiConnector, OpenAIConnector } from "../connect/openai.ts";
import { formatCandlesWithEma } from "../util/format.ts";
import { Candle } from "../model/candle.ts";
import { LLMAnalysisResult } from "../model/llm_result.ts";
import type { BullAnalysisResult, BearAnalysisResult } from "../model/agent_result.ts";
import { OKXExchange } from "../connect/exchange.ts";
import { calculateATRPercentage } from "../util/indicator.ts";
import { readHistory } from "../util/history_manager.ts";
import { getTicker } from "../connect/market.ts";

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
  const balance = await OKXExchange.getInstance().getBalance('USDT');
  const total = balance.total;
  const balanceText = `当前账户总权益为${total}，可用余额为${balance.free}。\n`;
  //获取持仓
  const positions = await OKXExchange.getInstance().getPositions("SWAP", symbol);
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
    const algoOrders = await OKXExchange.getInstance().getPendingAlgoOrders(symbol, "oco");
    const conditionalOrders = await OKXExchange.getInstance().getPendingAlgoOrders(
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

  // 获取当前价格
  const ticker = await getTicker(symbol);
  const lastText = `当前价格为${ticker?.last}\n`;
  

  // 组合分析文本
  const analysisText = balanceText + positionText + slText + lastText;

  const analysis = await openaiConnector.chat(
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

  const userprompt =
    `请根据以下分析内容进行最终决策，用户设置的单笔风险为${config.trade.risk}%。\n` +
    historyText +
    `\n### 当前分析报告:\n` +
    all_analysis;
  const decisionJson = await openaiConnector.chatWithJson(
    config.system_prompt.main,
    userprompt,
  );
  return new LLMAnalysisResult(decisionJson);
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

/**
 * 专业多头分析
 * @param all_analysis 综合分析文本
 */
export async function analyzeBull(
  all_analysis: string,
): Promise<BullAnalysisResult> {
  const userPrompt = `请基于以下市场分析报告，作为多头方进行分析：\n${all_analysis}`;

  const result = await openaiConnector.chatWithJson(
    config.system_prompt.bull_agent,
    userPrompt,
    config.llm.bull_model
  );
  return result as unknown as BullAnalysisResult;
}

/**
 * 专业空头分析
 * @param all_analysis 综合分析文本
 */
export async function analyzeBear(
  all_analysis: string,
): Promise<BearAnalysisResult> {
  const userPrompt = `请基于以下市场分析报告，作为空头方进行分析：\n${all_analysis}`;

  const result = await openaiConnector.chatWithJson(
    config.system_prompt.bear_agent,
    userPrompt,
    config.llm.bear_model
  );
  return result as unknown as BearAnalysisResult;
}

/**
 * 裁决者决策
 * @param bullResult 多头分析结果
 * @param bearResult 空头分析结果
 * @param all_analysis 原始分析文本 (作为背景)
 */
export async function arbiterDecision(
  bullResult: BullAnalysisResult,
  bearResult: BearAnalysisResult,
  all_analysis: string
): Promise<LLMAnalysisResult> {
  // 读取历史记录
  const history = readHistory();
  let historyText = "";
  if (history) {
    historyText = `\n\n### 历史决策记录 (供参考，按时间从旧到新):\n${history}\n`;
  }

  const userPrompt =
    `请根据以下双方辩论和市场分析进行最终裁决。\n` +
    `用户设置的单笔风险为 ${config.trade.risk}%。\n\n` +
    `### 多头观点 (Bull Agent):\n` +
    `信心分数: ${bullResult.bull_confidence}\n` +
    `理由: ${bullResult.reason}\n` +
    `止损建议: ${bullResult.stop_loss}\n` +
    `情景预测: ${bullResult.scenario_prediction}\n\n` +
    `### 空头观点 (Bear Agent):\n` +
    `信心分数: ${bearResult.bear_confidence}\n` +
    `理由: ${bearResult.reason}\n` +
    `止损建议: ${bearResult.stop_loss}\n` +
    `情景预测: ${bearResult.scenario_prediction}\n\n` +
    historyText +
    `\n### 原始分析摘要:\n` +
    all_analysis;

  const decisionJson = await openaiConnector.chatWithJson(
    config.system_prompt.arbiter_agent,
    userPrompt,
    config.llm.arbiter_model
  );

  return new LLMAnalysisResult(decisionJson);
}
