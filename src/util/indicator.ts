import { Candle } from '../model/candle.js';

/**
 * 计算指数移动平均线 (EMA)
 * Formula: EMA_today = (Price_today * K) + (EMA_yesterday * (1 - K))
 * K = 2 / (N + 1)
 * 
 * @param data 数值数组或K线数组
 * @param period 周期，默认为20
 * @returns EMA数组，长度与输入数组相同。由于EMA需要累积计算，数据越长越准确。
 *          前 period-1 个数据通常作为预热，计算出的EMA可能不准确或为null/0。
 *          此处实现：前 period-1 个点返回 null (为了保持数组长度一致)，第 period 个点使用 SMA 作为初始值。
 */
export function calculateEMA(data: (number | Candle)[], period: number = 20): (number | null)[] {
    if (!data || data.length < period) {
        // 数据长度不足以计算
        return new Array(data.length).fill(null);
    }

    const prices: number[] = data.map(item => {
        if (typeof item === 'number') {
            return item;
        } else {
            return item.close;
        }
    });

    // 检测是否为 K 线数据且时间为倒序 (最新 -> 最旧)
    let isReversed = false;
    if (data.length > 1 && typeof data[0] !== 'number' && typeof data[data.length - 1] !== 'number') {
        const first = data[0] as Candle;
        const last = data[data.length - 1] as Candle;
        if (first.ts > last.ts) {
            isReversed = true;
            // 反转价格数组，使其按时间正序排列 (旧 -> 新)，以便正确计算 EMA
            prices.reverse();
        }
    }

    const emaValues: (number | null)[] = new Array(prices.length).fill(null);
    const k = 2 / (period + 1);

    // 1. 计算第一个 EMA 值 (通常使用前 N 个周期的 SMA 作为起始 EMA)
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    const initialSMA = sum / period;
    emaValues[period - 1] = initialSMA;

    // 2. 计算后续的 EMA 值
    for (let i = period; i < prices.length; i++) {
        const price = prices[i];
        const prevEMA = emaValues[i - 1]!;

        // EMA = Price(t) * k + EMA(y) * (1 - k)
        const ema = (price * k) + (prevEMA * (1 - k));
        emaValues[i] = ema;
    }

    // 如果之前反转了数据，计算完成后需要将结果反转回来，确保与输入数组一一对应
    if (isReversed) {
        emaValues.reverse();
    }

    return emaValues;
}

/**
 * 专门用于计算 EMA20 的辅助函数
 * @param data K线数据或价格数组
 * @returns EMA20 数组
 */
export function calculateEMA20(data: (number | Candle)[]): (number | null)[] {
    return calculateEMA(data, 20);
}
