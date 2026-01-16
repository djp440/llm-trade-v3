// @ts-ignore
import * as echarts from 'echarts';
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { Candle } from '../model/candle.js';
import logger from './logger.js';

// 确保 output 目录存在
const outputDir = path.join(process.cwd(), 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * 绘制 K 线图并转换为 Base64 字符串
 * @param candles K线数据数组
 * @param emaData EMA数据数组
 * @param period K线周期 (如 '1m', '1H')
 * @param filename 可选：输出文件名，如果提供则同时保存到本地 output 目录
 * @returns 图片的 Base64 编码字符串
 */
async function drawKLineChart(
    candles: Candle[],
    emaData: (number | null)[],
    period: string = '',
    filename?: string
): Promise<string> {

    // 抛出异常提示该函数已过时
    throw new Error('drawKLineChart 函数已过时，请使用 drawKLineChartLWC 替代');

}
