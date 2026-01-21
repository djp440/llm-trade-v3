import { config } from "../util/config.ts";
import logger, { LogColor } from "../util/logger.ts";
import { LLMAnalysisResult } from "../model/llm_result.ts";
import {
  openMarketOrder,
  openMarketOrderWithTPSL,
  closeAllPositions,
  updateStopLoss
} from "../connect/trade.ts";
import { getTicker, getInstruments } from "../connect/market.ts";
import { OKXExchange } from "../connect/exchange.ts";

/**
 * 根据 symbol 推断 instType
 */
function getInstType(symbol: string): string {
  if (symbol.endsWith("-SWAP")) return "SWAP";
  if (symbol.includes("-C") || symbol.includes("-P")) return "OPTION"; // 简易判断
  if (symbol.split("-").length === 2) return "SPOT";
  // 如果包含数字，可能是交割 FUTURES
  if (/\d/.test(symbol.split("-").pop() || "")) return "FUTURES";
  return "SWAP";
}

export async function trade(symbol: string, decisionResult: LLMAnalysisResult) {
  // logger.info(`[${symbol}] 交易决策：${decisionResult.toString()}`, {
  //   color: LogColor.Green,
  // });

  let { action, quantity, stopLoss } = decisionResult;

  try {
    // 获取当前最新价格，用于校验止损合理性
    const ticker = await getTicker(symbol);
    const currentPrice = ticker ? parseFloat(ticker.last) : 0;

    // 自动计算仓位逻辑
    if ((action === "ENTRY_LONG" || action === "ENTRY_SHORT") && stopLoss) {
      try {
        const instType = getInstType(symbol);

        // 仅支持 SWAP 和 FUTURES 的自动计算，SPOT 逻辑不同（直接买币）
        // 暂时主要支持 SWAP
        if (instType === "SWAP" || instType === "FUTURES") {
          // 1. 获取账户余额 (假设 U 本位)
          const quoteCcy = "USDT";
          const balance = await OKXExchange.getInstance().getBalance(quoteCcy);
          const equity = balance.total;

          if (equity <= 0) {
            logger.error(`[${symbol}] 账户权益不足 (${equity})，无法计算开仓数量`);
            return; // 终止下单
          }

          // 2. 计算风险金额
          const riskPercent = config.trade.risk;
          const riskAmount = equity * (riskPercent / 100);

          // 3. 计算止损距离
          let priceDiff = 0;
          if (action === "ENTRY_LONG") {
            if (currentPrice > 0 && stopLoss >= currentPrice) {
              logger.warn(`[${symbol}] 做多止损(${stopLoss}) >= 现价(${currentPrice})，无法计算合理仓位，跳过下单`);
              return;
            }
            priceDiff = currentPrice - stopLoss;
          } else {
            if (currentPrice > 0 && stopLoss <= currentPrice) {
              logger.warn(`[${symbol}] 做空止损(${stopLoss}) <= 现价(${currentPrice})，无法计算合理仓位，跳过下单`);
              return;
            }
            priceDiff = stopLoss - currentPrice;
          }

          if (priceDiff <= 0) {
            logger.warn(`[${symbol}] 止损距离异常 (${priceDiff})，跳过下单`);
            return;
          }

          // 4. 计算对应币种数量 (Coins)
          // 风险额 = 亏损 = 币数 * 价差
          const coinQuantity = riskAmount / priceDiff;

          // 5. 转换为合约张数
          const instruments = await getInstruments(instType, undefined, symbol);
          if (instruments.length === 0) {
            logger.error(`[${symbol}] 无法获取合约信息，无法计算张数`);
            return;
          }
          const inst = instruments[0];

          let contractSz = 0;

          if (inst.ctType === 'linear') {
            // U本位: contractSz = coinQuantity / ctVal
            contractSz = coinQuantity / inst.ctVal;

            // 向下取整
            contractSz = Math.floor(contractSz);

            // 检查最小下单数量
            if (contractSz < inst.minSz) {
              logger.warn(`[${symbol}] 计算出的张数 ${contractSz} 小于最小下单数量 ${inst.minSz} (风险额: ${riskAmount.toFixed(2)} USDT, 价差: ${priceDiff.toFixed(2)})，忽略下单`);
              return;
            }

            // 更新 quantity
            quantity = contractSz;
            logger.info(`[${symbol}] 自动计算仓位: ${quantity} 张 (风险: ${riskPercent}%, 风险额: ${riskAmount.toFixed(2)}, 止损距: ${priceDiff.toFixed(2)}, 面值: ${inst.ctVal} ${inst.ctValCcy})`);

          } else {
            logger.warn(`[${symbol}] 暂不支持非 Linear (U本位) 合约自动计算仓位，请手动指定`);
            if (quantity === null) return; // 如果 LLM 也没给，就不下
          }
        } else {
          logger.warn(`[${symbol}] 暂不支持 ${instType} 类型的自动仓位计算`);
          if (quantity === null) return;
        }

      } catch (err) {
        logger.error(`[${symbol}] 计算仓位失败:`, err);
        return; // 计算失败则不下单
      }
    }

    switch (action) {
      case "ENTRY_LONG":
        if (quantity && quantity > 0) {
          if (stopLoss) {
            // 做多时，止损必须小于当前价格
            if (currentPrice > 0 && stopLoss >= currentPrice) {
              logger.warn(`[${symbol}] 做多止损价格(${stopLoss})必须小于当前价格(${currentPrice})，忽略止损直接下单`);
              await openMarketOrder(symbol, "buy", quantity.toString());
            } else {
              await openMarketOrderWithTPSL(
                symbol,
                "buy",
                quantity.toString(),
                stopLoss.toString(),
              );
            }
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
            // 做空时，止损必须大于当前价格
            if (currentPrice > 0 && stopLoss <= currentPrice) {
              logger.warn(`[${symbol}] 做空止损价格(${stopLoss})必须大于当前价格(${currentPrice})，忽略止损直接下单`);
              await openMarketOrder(symbol, "sell", quantity.toString());
            } else {
              await openMarketOrderWithTPSL(
                symbol,
                "sell",
                quantity.toString(),
                stopLoss.toString(),
              );
            }
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
          // 这里的校验比较复杂，因为不知道当前持仓方向，暂时跳过校验
          // 或者可以先查询持仓再校验，但 UPDATE_STOP_LOSS 逻辑中可能已经包含
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
