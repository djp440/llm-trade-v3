import { openMarketOrder, openMarketOrderWithTPSL, closeAllPositions } from '../connect/trade.js';
import { okxExchange } from '../connect/exchange.js';
import logger from '../util/logger.js';
import { Position } from '../model/position.js';

const SYMBOL = 'BTC-USDT-SWAP';

async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    try {
        logger.info('=============================================');
        logger.info('开始执行交易功能测试脚本 (模拟盘)');
        logger.info('=============================================');

        // 1. 确保初始状态无持仓
        logger.info('[Step 0] 清理环境: 尝试平仓所有持仓');
        try {
            // 先尝试获取持仓，如果有才平
            const positions = await okxExchange.getPositions('SWAP', SYMBOL);
            if (positions.length > 0) {
                 await closeAllPositions(SYMBOL);
                 await wait(2000);
            } else {
                logger.info('当前无持仓，无需清理');
            }
        } catch (e: any) {
            logger.warn('清理持仓时遇到错误:', e.message);
        }

        // 2. 测试市价开仓
        logger.info('[Step 1] 测试市价开仓 (Open Market Order)');
        await openMarketOrder(SYMBOL, 'buy', '1');
        await wait(3000);

        // 验证持仓
        let positions: Position[] = await okxExchange.getPositions('SWAP', SYMBOL);
        if (positions.length === 0) {
            throw new Error('市价开仓后未查询到持仓!');
        }
        logger.info(`[验证] 持仓成功: ${positions[0].toString()}`);
        const entryPrice = positions[0].entryPrice;

        // 3. 测试市价平仓
        logger.info('[Step 2] 测试市价平仓 (Close Market Position)');
        await closeAllPositions(SYMBOL);
        await wait(3000);

        // 验证已平仓
        positions = await okxExchange.getPositions('SWAP', SYMBOL);
        if (positions.length > 0) {
             if (positions[0].quantity !== 0) {
                // 有时候 OKX 返回持仓数量为 0 的记录
                if (Math.abs(positions[0].quantity) > 0) {
                    throw new Error(`平仓后仍有持仓: ${positions[0].quantity}`);
                }
             }
        }
        logger.info('[验证] 平仓成功');

        // 4. 测试带止盈止损开仓
        logger.info('[Step 3] 测试带止盈止损开仓 (Open Market with TP/SL)');
        
        // 使用上一次的 entryPrice 作为参考
        const currentPrice = entryPrice;
        // 止损触发价：买入价 * 0.98
        const slPrice = (currentPrice * 0.98).toFixed(1); 
        // 止盈触发价：买入价 * 1.02
        const tpPrice = (currentPrice * 1.02).toFixed(1); 
        
        logger.info(`参考价格: ${currentPrice}, 设置止损: ${slPrice}, 止盈: ${tpPrice}`);
        
        await openMarketOrderWithTPSL(SYMBOL, 'buy', '1', slPrice, tpPrice);
        await wait(3000);

        // 验证持仓
        positions = await okxExchange.getPositions('SWAP', SYMBOL);
        if (positions.length === 0) {
            throw new Error('带止盈止损开仓后未查询到持仓!');
        }
        logger.info(`[验证] 持仓成功: ${positions[0].toString()}`);
        
        // 5. 最后清理
        logger.info('[Step 4] 清理测试持仓');
        await closeAllPositions(SYMBOL);
        await wait(2000);
        
        logger.info('=============================================');
        logger.info('测试脚本执行完毕，所有功能验证通过');
        logger.info('=============================================');

    } catch (error) {
        logger.error('测试失败:', error);
        process.exit(1);
    }
}

runTest();
