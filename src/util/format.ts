import { Candle } from "../model/candle.js";
import dayjs from "dayjs";

/**
 * 格式化数值，保留适度精度以节省 Token
 * @param num 数值
 * @returns 格式化后的字符串
 */
function formatNumber(num: number): string {
  // 转换为字符串，通常能保留足够精度且不包含多余的零
  // 如果需要更严格的控制，可以使用 toPrecision 或 toFixed 后再转 Number

  // 1. 处理极小值 (绝对值 < 0.0001 且不为 0)，避免被 toFixed(5) 截断为 0
  // 例如 0.00001234 -> 1.234e-5
  if (Math.abs(num) < 0.0001 && num !== 0) {
    return Number(num.toPrecision(4)).toString();
  }

  // 2. 对于一般数值，保留最多 5 位小数，对于大多数加密货币交易对足够且节省空间
  // Number() 会自动去除小数点后多余的 0
  return Number(num.toFixed(5)).toString();
}

/**
 * 将 Candle 数组和 EMA 数组格式化为节省 token 的 CSV 格式字符串
 * 格式: T(Time),O(Open),H(High),L(Low),C(Close),V(Volume),E(EMA)
 * 时间格式: MM-DD HH:mm
 *
 * @param candles K线数据数组
 * @param emaData EMA数据数组
 * @returns 结构化的 CSV 文本
 */
export function formatCandlesWithEma(
  candles: Candle[],
  emaData: (number | null)[]
): string {
  if (!candles || !emaData || candles.length === 0) {
    return "";
  }

  if (candles.length !== emaData.length) {
    // 允许容错，取较短的长度
    const minLen = Math.min(candles.length, emaData.length);
    candles = candles.slice(0, minLen);
    emaData = emaData.slice(0, minLen);
  }

  // 简短的表头
  const headers = ["T", "O", "H", "L", "C", "V", "E"];
  const lines = [headers.join(",")];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const ema = emaData[i];

    // 时间格式化：MM-DD HH:mm (11 chars)
    const timeStr = dayjs(c.ts).format("MM-DD HH:mm");

    // EMA 处理，null 显示为 -
    const emaStr = ema !== null ? formatNumber(ema) : "-";

    // 成交量通常保留整数即可
    const volStr = Math.round(c.vol).toString();

    const row = [
      timeStr,
      formatNumber(c.open),
      formatNumber(c.high),
      formatNumber(c.low),
      formatNumber(c.close),
      volStr,
      emaStr,
    ];

    lines.push(row.join(","));
  }

  return lines.join("\n");
}
