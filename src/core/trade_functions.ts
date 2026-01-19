import logger, { LogColor } from "../util/logger.js";
import { LLMAnalysisResult } from "../model/llm_result.js";
import {
  openMarketOrder,
  openMarketOrderWithTPSL,
  closeAllPositions,
  updateStopLoss
} from "../connect/trade.js";

export async function trade(symbol: string, decisionResult: LLMAnalysisResult) {
  // logger.info(`[${symbol}] 交易决策：${decisionResult.toString()}`, {
  //   color: LogColor.Green,
  // });

  const { action, quantity, stopLoss } = decisionResult;

  try {
    switch (action) {
      case "ENTRY_LONG":
        if (quantity && quantity > 0) {
          if (stopLoss) {
            await openMarketOrderWithTPSL(
              symbol,
              "buy",
              quantity.toString(),
              stopLoss.toString(),
            );
          } else {
            await openMarketOrder(symbol, "buy", quantity.toString());
          }
        } else {
          logger.warn(`[${symbol}] 建议开多但未提供有效数量`);
        }
        break;

      case "ENTRY_SHORT":
        if (quantity && quantity > 0) {
          if (stopLoss) {
            await openMarketOrderWithTPSL(
              symbol,
              "sell",
              quantity.toString(),
              stopLoss.toString(),
            );
          } else {
            await openMarketOrder(symbol, "sell", quantity.toString());
          }
        } else {
          logger.warn(`[${symbol}] 建议开空但未提供有效数量`);
        }
        break;

      case "EXIT_LONG":
        await closeAllPositions(symbol);
        break;

      case "EXIT_SHORT":
        await closeAllPositions(symbol);
        break;

      case "UPDATE_STOP_LOSS":
        if (stopLoss) {
          await updateStopLoss(symbol, stopLoss.toString());
        } else {
          logger.warn(`[${symbol}] 建议更新止损但未提供有效止损价格`);
        }
        break;

      case "NO_OP":
        logger.info(`[${symbol}] 保持观望`);
        break;

      default:
        logger.warn(`[${symbol}] 未知动作: ${action}`);
        break;
    }
  } catch (error) {
    logger.error(`[${symbol}] 交易执行失败:`, error);
    // 不抛出错误，以免中断整个轮询流程，但记录错误
  }
}
