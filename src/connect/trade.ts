import { okxExchange } from './exchange.js';
import logger from '../util/logger.js';

/**
 * 市价开仓
 * @param symbol 交易对，如 BTC-USDT-SWAP
 * @param side 买卖方向，buy 或 sell
 * @param size 开仓数量 (张)
 */
export async function openMarketOrder(symbol: string, side: 'buy' | 'sell', size: string) {
    logger.info(`开始市价开仓: ${symbol} ${side} ${size}`);
    try {
        const params = {
            instId: symbol,
            tdMode: 'cross', // 全仓
            side: side,
            ordType: 'market',
            sz: size
        };
        const result = await okxExchange.placeOrder(params);
        logger.info(`市价开仓成功: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        logger.error(`市价开仓失败:`, error);
        throw error;
    }
}

/**
 * 市价开仓同时附带止盈止损
 * @param symbol 交易对
 * @param side 买卖方向
 * @param size 开仓数量
 * @param slTriggerPx 止损触发价
 * @param tpTriggerPx 止盈触发价 (可选)
 */
export async function openMarketOrderWithTPSL(
    symbol: string,
    side: 'buy' | 'sell',
    size: string,
    slTriggerPx: string,
    tpTriggerPx?: string
) {
    logger.info(`开始市价开仓(带止盈止损): ${symbol} ${side} ${size}, SL: ${slTriggerPx}, TP: ${tpTriggerPx}`);
    try {
        const attachAlgoOrds: any[] = [];

        // 构建止损止盈参数 (使用单个对象，OCO模式)
        const algoOrder: any = {
            tpSlMode: 'last' // 使用最新成交价触发
        };

        if (slTriggerPx) {
            algoOrder.slTriggerPx = slTriggerPx;
            algoOrder.slOrdPx = '-1'; // -1 代表市价止损
        }

        if (tpTriggerPx) {
            algoOrder.tpTriggerPx = tpTriggerPx;
            algoOrder.tpOrdPx = '-1'; // -1 代表市价止盈
        }

        attachAlgoOrds.push(algoOrder);

        const params = {
            instId: symbol,
            tdMode: 'cross',
            side: side,
            ordType: 'market',
            sz: size,
            attachAlgoOrds: attachAlgoOrds
        };

        // logger.info(`下单参数: ${JSON.stringify(params)}`);

        const result = await okxExchange.placeOrder(params);
        logger.info(`市价开仓(带止盈止损)成功: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        logger.error(`市价开仓(带止盈止损)失败:`, error);
        throw error;
    }
}

/**
 * 一键市价平仓
 * @param symbol 交易对
 */
export async function closeAllPositions(symbol: string) {
    logger.info(`开始市价全平: ${symbol}`);
    try {
        // 全仓模式下的市价全平
        const params = {
            instId: symbol,
            mgnMode: 'cross',
            // net 模式下不需要 posSide
        };
        const result = await okxExchange.closePosition(params);
        logger.info(`市价全平成功: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        logger.error(`市价全平失败:`, error);
        throw error;
    }
}
