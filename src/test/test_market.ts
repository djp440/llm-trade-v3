import { getInstruments } from '../connect/market.js';
import logger from '../util/logger.js';

async function testMarket() {
    try {
        logger.info('开始测试市场数据接口...');

        // 1. 测试获取 SWAP 产品列表
        logger.info('正在获取 SWAP 产品列表...');
        const swaps = await getInstruments('SWAP', 'BTC-USD');
        logger.info(`获取到 ${swaps.length} 个 SWAP 产品`);
        
        if (swaps.length > 0) {
            const firstSwap = swaps[0];
            logger.info('第一个产品详情:');
            logger.info(`ID: ${firstSwap.instId}`);
            logger.info(`Type: ${firstSwap.instType}`);
            logger.info(`Contract Value: ${firstSwap.ctVal} ${firstSwap.ctValCcy}`);
            logger.info(`Min Size: ${firstSwap.minSz}`);
            logger.info(`Tick Size: ${firstSwap.tickSz}`);
            logger.info(`State: ${firstSwap.state}`);
        }

        // 2. 测试获取 SPOT 产品列表 (BTC-USDT)
        logger.info('正在获取 SPOT 产品列表 (BTC-USDT)...');
        const spots = await getInstruments('SPOT', undefined, 'BTC-USDT');
        logger.info(`获取到 ${spots.length} 个 SPOT 产品`);
        
        if (spots.length > 0) {
            const spot = spots[0];
            logger.info(`SPOT 产品详情: ${spot.instId}, Min Size: ${spot.minSz}, Tick Size: ${spot.tickSz}`);
        }

        logger.info('市场数据接口测试完成！');
    } catch (error) {
        logger.error(`测试失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

testMarket();
