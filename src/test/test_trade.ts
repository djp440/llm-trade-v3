import { okxTrade } from '../connect/trade.js';
import { okxExchange } from '../connect/exchange.js';
import logger from '../util/logger.js';

async function testTrade() {
    try {
        const instId = 'ETH-USDT-SWAP';
        logger.info(`开始测试 OKX 交易功能, 交易对: ${instId}`);

        // 1. 初始化账户设置
        await okxExchange.initAccountSettings(instId);

        // 2. 获取当前价格用于设置 TP/SL
        const lastPrice = await okxExchange.getTicker(instId);
        logger.info(`当前最新价格: ${lastPrice}`);

        // 3. 测试市价开仓 (1张)
        logger.info('--- 测试 1: 市价开多 ---');
        const order1 = await okxTrade.placeMarketOrder(instId, 'buy', '1');
        logger.info(`市价开多已下单: ${order1.ordId}`);

        // 4. 测试市价开仓带止盈止损
        // 设置 TP 为当前价 + 2%, SL 为当前价 - 1%
        const tpPrice = (lastPrice * 1.02).toFixed(2);
        const slPrice = (lastPrice * 0.99).toFixed(2);
        
        logger.info(`--- 测试 2: 市价开多带 TP/SL (TP: ${tpPrice}, SL: ${slPrice}) ---`);
        const order2 = await okxTrade.placeMarketOrderWithTPSL(instId, 'buy', '1', tpPrice, slPrice);
        logger.info(`市价开多(带 TP/SL)已下单: ${order2.ordId}`);

        // 等待一会儿让系统处理
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 5. 获取当前持仓
        const positions = await okxExchange.getPositions('SWAP', instId);
        logger.info(`当前 ${instId} 持仓数量: ${positions.length}`);
        positions.forEach(pos => logger.info(pos.toString()));

        // 6. 测试一键平仓
        if (positions.length > 0) {
            logger.info('--- 测试 3: 一键市价平仓 ---');
            await okxTrade.closePosition(instId);
            logger.info('已发送平仓请求');
        }

        // 7. 再次确认持仓
        await new Promise(resolve => setTimeout(resolve, 2000));
        const finalPositions = await okxExchange.getPositions('SWAP', instId);
        logger.info(`平仓后 ${instId} 持仓数量: ${finalPositions.length}`);

        logger.info('OKX 交易功能测试完成！');
    } catch (error: any) {
        logger.error(`测试过程中出错: ${error.message}`);
    }
}

testTrade();
