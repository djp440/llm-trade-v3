import { config } from "../util/config.js";
import { openaiConnector } from "../connect/openai.js";
import { formatCandlesWithEma } from "../util/format.js";
import { Candle } from "../model/candle.js";
import { okxExchange, OKXExchange } from "../connect/exchange.js";
import { calculateATRPercentage } from "../util/indicator.js";

/**
 * 分析图像
 * @param interval 时间周期
 * @param imageUrl 图像URL
 * @returns 分析结果
 */
export async function analyzeImage(interval: string, imageUrl: string) {
  const systemPrompt = config.system_prompt.visual;
  let userPrompt = `这是${interval}周期的k线图表。`;
  if (config.trade.paperTrade) {
    userPrompt +=
      "模拟盘已启用，由于流动性问题，你可能会看到波动率极大、或充满毛刺的k线图。";
  }
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
  let userPrompt = `以下为${interval}周期的ohlcv+ema数据。`;
  if (config.trade.paperTrade) {
    userPrompt +=
      "模拟盘已启用，由于流动性问题，你可能会看到波动率极大、或充满毛刺的k线图。\n";
  }
  userPrompt += formatData;
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
  // 计算ATR
  const atrValues = calculateATRPercentage(
    candels,
    config.indicator.atr_period,
  );
  const atrText = `当前ATR系列值为${atrValues}。\n`;
  // 组合分析文本
  const analysisText = balanceText + positionText + atrText;

  const analysis = openaiConnector.chat(
    config.system_prompt.risk_analysis,
    analysisText,
    config.llm.risk_analysis_model,
  );

  return analysis;
}

export async function decision(all_analysis: string) {
  const userprompt =
    `请根据以下分析内容进行最终决策，用户设置的单笔风险为${config.trade.risk}%。\n` +
    all_analysis;
  const decision = await openaiConnector.chatWithJson(
    config.system_prompt.main,
    userprompt,
  );
  return decision;
}
