import { Candle } from "../model/candle.js";

/**
 * 计算指数移动平均线 (EMA)
 * Formula: EMA_today = (Price_today * K) + (EMA_yesterday * (1 - K))
 * K = 2 / (N + 1)
 *
 * @param data 数值数组或K线数组
 * @param period 周期，默认为20
 * @returns EMA数组，长度与输入数组相同。
 */
export function calculateEMA(
  data: (number | Candle)[],
  period: number = 20,
): (number | null)[] {
  if (!data || data.length < period) {
    return new Array(data.length).fill(null);
  }

  const length = data.length;
  const emaValues: (number | null)[] = new Array(length).fill(null);
  const k = 2 / (period + 1);

  // 检测是否为 K 线数据且时间为倒序 (最新 -> 最旧)
  // 如果是倒序，我们需要从后往前遍历来模拟时间正序计算
  let isReversed = false;
  if (
    length > 1 &&
    typeof data[0] !== "number" &&
    typeof data[length - 1] !== "number"
  ) {
    const first = data[0] as Candle;
    const last = data[length - 1] as Candle;
    if (first.ts > last.ts) {
      isReversed = true;
    }
  }

  // 获取价格的辅助函数
  const getPrice = (i: number): number => {
    const item = data[i];
    return typeof item === "number" ? item : item.close;
  };

  // 根据顺序确定遍历方向
  // 正序(旧->新): 0 -> length-1
  // 倒序(新->旧): length-1 -> 0
  
  // 我们统一逻辑：计算时总是按时间旧->新进行。
  // 如果输入是倒序 (index 0 是最新)，那么时间旧的数据在 index = length-1。
  // 此时我们需要从 length-1 开始计算到 0。

  if (!isReversed) {
    // 正序处理 (0 是最旧)
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += getPrice(i);
    }
    let prevEMA = sum / period;
    emaValues[period - 1] = prevEMA;

    for (let i = period; i < length; i++) {
      const price = getPrice(i);
      prevEMA = price * k + prevEMA * (1 - k);
      emaValues[i] = prevEMA;
    }
  } else {
    // 倒序处理 (length-1 是最旧)
    // 1. 计算初始 SMA (使用最旧的 period 个数据)
    // 最旧的数据在 length-1, length-2 ... 
    // 例如 length=100, period=20. 最旧的是 99. 
    // 初始窗口是 [99, 98, ..., 80] (共20个)
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += getPrice(length - 1 - i);
    }
    let prevEMA = sum / period;
    // 记录位置：对应的是窗口中最新的那个点，即 length - period (例如 80)
    emaValues[length - period] = prevEMA;

    // 2. 后续计算
    // 从 length - period - 1 往 0 走
    for (let i = length - period - 1; i >= 0; i--) {
      const price = getPrice(i);
      prevEMA = price * k + prevEMA * (1 - k);
      emaValues[i] = prevEMA;
    }
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

/**
 * 计算平均真实波幅 (ATR)
 * Formula:
 * TR = max(High - Low, abs(High - Close_prev), abs(Low - Close_prev))
 * ATR = Wilder's Smoothing of TR
 *
 * @param data K线数据数组
 * @param period 周期，默认为14
 * @returns ATR数值数组，长度与输入相同
 */
export function calculateATR(
  data: Candle[],
  period: number = 14,
): (number | null)[] {
  if (!data || data.length < period) {
    return new Array(data.length).fill(null);
  }

  const length = data.length;
  const atrValues: (number | null)[] = new Array(length).fill(null);
  const trValues: number[] = new Array(length).fill(0);

  // 检测顺序
  let isReversed = false;
  if (data.length > 1 && data[0].ts > data[data.length - 1].ts) {
    isReversed = true;
  }

  // 1. 计算 TR
  if (!isReversed) {
    // 正序 (0 是最旧)
    trValues[0] = data[0].high - data[0].low;
    for (let i = 1; i < length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      trValues[i] = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
    }
    
    // 2. 计算 ATR
    // 首个 ATR 是前 period 个 TR 的 SMA
    let sumTR = 0;
    for (let i = 0; i < period; i++) {
      sumTR += trValues[i];
    }
    let currentATR = sumTR / period;
    atrValues[period - 1] = currentATR;

    // Wilder's Smoothing
    for (let i = period; i < length; i++) {
      currentATR = (currentATR * (period - 1) + trValues[i]) / period;
      atrValues[i] = currentATR;
    }

  } else {
    // 倒序 (length-1 是最旧)
    // 最旧的点 TR 无法参考前一个收盘价(因为它没有更旧的了)，所以只能 H-L
    // data[length-1] 是最旧
    trValues[length - 1] = data[length - 1].high - data[length - 1].low;
    
    // 从 length-2 往 0 遍历
    for (let i = length - 2; i >= 0; i--) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i + 1].close; // 前一天是 i+1
      trValues[i] = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
    }

    // 2. 计算 ATR
    // 初始 SMA: [length-1, ..., length-period]
    let sumTR = 0;
    for (let i = 0; i < period; i++) {
      sumTR += trValues[length - 1 - i];
    }
    let currentATR = sumTR / period;
    atrValues[length - period] = currentATR;

    // Wilder's Smoothing: 从 length - period - 1 往 0
    for (let i = length - period - 1; i >= 0; i--) {
      currentATR = (currentATR * (period - 1) + trValues[i]) / period;
      atrValues[i] = currentATR;
    }
  }

  return atrValues;
}

/**
 * 计算以相对收盘价百分比表示的 ATR (ATR %)
 * Formula: (ATR / Close) * 100
 *
 * @param data K线数据数组
 * @param period 周期，默认为14
 * @returns ATR百分比数组 (0-100 之间)
 */
export function calculateATRPercentage(
  data: Candle[],
  period: number = 14,
): (number | null)[] {
  const atrValues = calculateATR(data, period);

  return atrValues.map((atr, index) => {
    if (atr === null) return null;
    const close = data[index].close;
    if (close === 0) return 0;
    return (atr / close) * 100;
  });
}
