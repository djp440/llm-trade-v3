import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import { Candle } from '../model/candle.js';
import logger from './logger.js';

/**
 * 使用 Lightweight Charts 生成 K 线图图片
 * @param candles K线数据
 * @param emaData EMA数据
 * @param period 周期
 * @returns Base64 格式图片
 */
export async function drawKLineChartLWC(
    candles: Candle[],
    emaData: (number | null)[],
    period: string = ''
): Promise<string> {
    const width = 1200;
    const height = 800;

    // 确保数据按时间升序排列 (旧 -> 新)
    let plotCandles = [...candles];
    let plotEma = [...emaData];

    if (plotCandles.length > 1 && plotCandles[0].ts > plotCandles[plotCandles.length - 1].ts) {
        plotCandles.reverse();
        plotEma.reverse();
    }

    // 计算时间范围字符串
    let dateRangeText = '';
    if (plotCandles.length > 0) {
        const formatStr = period.endsWith('m') || period.endsWith('H') ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD';
        const startTime = dayjs(plotCandles[0].ts).format(formatStr);
        const endTime = dayjs(plotCandles[plotCandles.length - 1].ts).format(formatStr);
        dateRangeText = `${startTime} ~ ${endTime}`;
    }

    // 转换数据为 LWC 格式
    // LWC 时间需要是 string (YYYY-MM-DD) 或 timestamp (seconds)
    // 这里使用 timestamp (seconds)
    const candleData = plotCandles.map(c => ({
        time: c.ts / 1000, // LWC uses seconds for unix timestamp
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
    }));

    const volumeData = plotCandles.map(c => ({
        time: c.ts / 1000,
        value: c.vol,
        color: c.close > c.open ? '#00da3c' : '#ec0000' // 匹配 draw.ts 的颜色
    }));

    // EMA 数据，过滤掉 null
    const lineData = plotEma.map((val, index) => {
        if (val === null) return null;
        return {
            time: plotCandles[index].ts / 1000,
            value: val
        };
    }).filter(item => item !== null);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // 常用容器/CI配置
        });
        const page = await browser.newPage();

        // 设置视口大小
        await page.setViewport({ width, height });

        // 读取 lightweight-charts 库文件内容
        const lwcPath = path.resolve(process.cwd(), 'node_modules', 'lightweight-charts', 'dist', 'lightweight-charts.standalone.production.js');

        // 构建 HTML 内容
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
                #container { width: ${width}px; height: ${height}px; }
                #period-mark {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    z-index: 20;
                    font-size: 24px;
                    font-weight: bold;
                    color: #131722;
                    background-color: rgba(255, 255, 255, 0.8);
                    padding: 4px 12px;
                    border-radius: 4px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                #date-range-mark {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    z-index: 20;
                    font-size: 16px;
                    font-weight: 500;
                    color: #555;
                    background-color: rgba(255, 255, 255, 0.8);
                    padding: 4px 12px;
                    border-radius: 4px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
            </style>
        </head>
        <body>
            <div id="container"></div>
            ${period ? `<div id="period-mark">${period}</div>` : ''}
            ${dateRangeText ? `<div id="date-range-mark">${dateRangeText}</div>` : ''}
        </body>
        </html>
        `;

        await page.setContent(htmlContent);

        // 注入库文件
        await page.addScriptTag({ path: lwcPath });

        // 定义颜色常量
        const UP_COLOR = '#00da3c';
        const DOWN_COLOR = '#ec0000';

        // 执行绘图逻辑
        await page.evaluate((
            candleData,
            lineData,
            UP_COLOR,
            DOWN_COLOR
        ) => {
            // @ts-ignore
            const { createChart, CandlestickSeries, LineSeries } = window.LightweightCharts;

            const container = document.getElementById('container');
            const chart = createChart(container, {
                layout: {
                    background: { type: 'solid', color: '#ffffff' },
                    textColor: '#333',
                },
                grid: {
                    vertLines: { color: '#f0f0f0' },
                    horzLines: { color: '#f0f0f0' },
                },
                rightPriceScale: {
                    visible: true,
                    borderColor: '#d1d4dc',
                },
                leftPriceScale: {
                    visible: true,
                    borderColor: '#d1d4dc',
                },
                timeScale: {
                    borderColor: '#d1d4dc',
                    timeVisible: true,
                    secondsVisible: false,
                },
                crosshair: {
                    // 禁用十字准线 (虽然截图时通常不显示，但显式禁用更安全)
                    vertLine: { visible: false },
                    horzLine: { visible: false },
                },
            });

            // 1. K线图 (主图)
            const candlestickSeries = chart.addSeries(CandlestickSeries, {
                upColor: UP_COLOR,
                downColor: DOWN_COLOR,
                borderUpColor: '#008F28',
                borderDownColor: '#8A0000',
                wickUpColor: '#008F28',
                wickDownColor: '#8A0000',
                // 禁用当前价格线和价格标签
                priceLineVisible: false,
                lastValueVisible: false,
            });
            candlestickSeries.setData(candleData);

            // 2. EMA (主图)
            const lineSeries = chart.addSeries(LineSeries, {
                color: '#2962FF',
                lineWidth: 2,
                priceScaleId: 'right',
                // 禁用当前价格线和价格标签
                priceLineVisible: false,
                lastValueVisible: false,
            });
            lineSeries.setData(lineData);

            // 适配内容
            chart.timeScale().fitContent();
        }, candleData, lineData, UP_COLOR, DOWN_COLOR);

        // 截图
        // 等待一小会儿确保渲染完成 (requestAnimationFrame)
        // LWC 渲染非常快，但 Puppeteer 截图可能太快
        await new Promise(r => setTimeout(r, 500));

        const element = await page.$('#container');
        if (!element) throw new Error('Container not found');

        const base64Buffer = await element.screenshot({ encoding: 'base64' });

        return base64Buffer;

    } catch (error) {
        logger.error('Error generating LWC chart:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
