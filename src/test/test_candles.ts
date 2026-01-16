import { getCandles } from '../connect/market.js';
import logger from '../util/logger.js';

async function testCandles() {
    try {
        const instId = 'BTC-USDT-SWAP';
        const bar = '1m';
        
        logger.info(`开始测试获取 ${instId} 的 ${bar} K线数据...`);
        
        const candles = await getCandles(instId, bar, 5);
        
        logger.info(`成功获取 ${candles.length} 条K线数据`);
        
        if (candles.length > 0) {
            logger.info('最新 5 条K线详情:');
            candles.forEach((candle, index) => {
                logger.info(`[${index + 1}] ${candle.toString()}`);
            });

            // 验证数据有效性
            const latest = candles[0];
            if (latest.ts > 0 && latest.close > 0) {
                logger.info('K线数据验证通过');
            } else {
                logger.error('K线数据验证失败: 关键字段无效');
            }
        } else {
            logger.warn('未获取到任何K线数据');
        }
        
    } catch (error) {
        logger.error(`测试失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

testCandles();
