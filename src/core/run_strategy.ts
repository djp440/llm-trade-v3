import { config } from '../util/config.js';
import logger from '../util/logger.js';
import { getCandles } from '../connect/market.js';

/**
 * 将时间间隔字符串转换为毫秒数
 * @param interval 例如 "1m", "4h", "1d"
 */
function getIntervalMs(interval: string): number {
    const unit = interval.slice(-1);
    const value = parseInt(interval.slice(0, -1));

    if (isNaN(value)) {
        throw new Error(`无法解析时间间隔数值: ${interval}`);
    }

    switch (unit) {
        case 'm':
            return value * 60 * 1000;
        case 'h':
        case 'H':
            return value * 60 * 60 * 1000;
        case 'd':
        case 'D':
            return value * 24 * 60 * 60 * 1000;
        case 'w':
        case 'W':
            return value * 7 * 24 * 60 * 60 * 1000;
        default:
            throw new Error(`不支持的时间单位: ${unit}`);
    }
}

/**
 * 策略主运行循环
 */
export async function runStrategy() {
    try {
        const tradeInterval = config.candle.trade_interval;
        logger.info(`启动策略循环，交易周期: ${tradeInterval}`);

        const intervalMs = getIntervalMs(tradeInterval);

        // 首次运行时，计算距离下一个周期的等待时间
        // 例如 1m 周期，当前 12:00:10，则等到 12:01:00 (K线收盘/新K线开盘)
        // 为了确保K线已收盘，我们通常在整点过一点点执行，或者就在整点执行

        while (true) {
            const now = Date.now();
            // 计算下一个整点时间
            // Math.floor(now / intervalMs) * intervalMs 是当前周期的起始时间
            // + intervalMs 是下一个周期的起始时间
            let nextRunTime = (Math.floor(now / intervalMs) + 1) * intervalMs;

            // 添加一点点延迟（例如 1秒），确保交易所K线数据已生成
            // nextRunTime += 1000; 

            let waitTime = nextRunTime - now;

            // 如果计算出的等待时间异常（理论上不会，因为用的 +1），进行修正
            if (waitTime <= 0) {
                waitTime = intervalMs;
            }

            logger.info(`等待下一次 ${tradeInterval} K线收盘... 预计等待 ${(waitTime / 1000).toFixed(1)} 秒`);

            await new Promise(resolve => setTimeout(resolve, waitTime));

            // 唤醒后执行操作
            try {
                // 这里是 K 线收盘时的操作逻辑
                const symbol = 'BTC-USDT-SWAP'; // 示例交易对

                // 1. 获取刚刚收盘的那根 K 线数据
                // 至少获取3根才能获取到刚刚收盘的那根k线
                const candles = await getCandles(symbol, tradeInterval, 3);
                if (candles && candles.length > 0) {
                    logger.info(`获取到 ${symbol} 最新收盘的K线: ${candles[1].toString()}`);
                }

                // 2. 执行核心策略逻辑 (目前占位)
                // TODO: 在这里调用分析模块和交易模块





                logger.info(`策略周期 ${tradeInterval} 执行完毕`);
            } catch (err) {
                logger.error('策略执行周期内发生错误:', err);
                // 出错后不中断循环，继续下一次
            }
        }

    } catch (error) {
        logger.error('策略主循环发生致命错误:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
import { fileURLToPath } from 'url';
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    runStrategy();
} else {
    // Debugging why it didn't run
    // console.log('Not main module:', process.argv[1], fileURLToPath(import.meta.url));
    // For now, let's force run it if we suspect the check is failing during development
    // Or just leave it as is if I fix the check.

    // Attempting to run anyway if the file path matches end of argv[1]
    if (process.argv[1].endsWith('run_strategy.ts')) {
        runStrategy();
    }
}
