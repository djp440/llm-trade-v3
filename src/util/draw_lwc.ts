import dayjs from 'dayjs';
import { Candle } from '../model/candle.js';
import logger from './logger.js';
import { getSharedPage } from './puppeteer_instance.js';

// Mutex to ensure chart generation is serialized on the shared page
let chartMutex = Promise.resolve();

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
    const candleData = plotCandles.map(c => ({
        time: c.ts / 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
    }));

    const lineData = plotEma.map((val, index) => {
        if (val === null) return null;
        return {
            time: plotCandles[index].ts / 1000,
            value: val
        };
    }).filter(item => item !== null);

    // 等待锁
    const previousMutex = chartMutex;
    let releaseMutex: () => void;
    // 创建新的锁 Promise，并保存 resolve 函数
    const newMutex = new Promise<void>(resolve => { releaseMutex = resolve; });
    // 更新全局锁，让下一个请求等待这个 newMutex
    chartMutex = newMutex.catch(() => { }); // catch to prevent error propagation affecting next caller

    try {
        await previousMutex;

        const page = await getSharedPage();

        // 设置视口大小 (复用页面时可能需要重新设置)
        await page.setViewport({ width, height });

        // 构建简洁的 HTML 容器
        const htmlContent = `
        <style>
            body { margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            #container { width: ${width}px; height: ${height}px; }
            .mark {
                position: absolute;
                z-index: 20;
                font-weight: bold;
                background-color: rgba(255, 255, 255, 0.8);
                padding: 4px 12px;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            #period-mark { top: 10px; left: 10px; font-size: 24px; color: #131722; }
            #date-range-mark { top: 10px; right: 10px; font-size: 16px; color: #555; }
        </style>
        <div id="container"></div>
        ${period ? `<div id="period-mark" class="mark">${period}</div>` : ''}
        ${dateRangeText ? `<div id="date-range-mark" class="mark">${dateRangeText}</div>` : ''}
        `;

        await page.setContent(htmlContent);

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
            // 清理旧图表
            if (container) container.innerHTML = '';

            const chart = createChart(container, {
                width: 1200,
                height: 800,
                layout: {
                    background: { type: 'solid', color: '#ffffff' },
                    textColor: '#333',
                },
                grid: {
                    vertLines: { color: '#f0f0f0' },
                    horzLines: { color: '#f0f0f0' },
                },
                rightPriceScale: { visible: true, borderColor: '#d1d4dc' },
                leftPriceScale: { visible: true, borderColor: '#d1d4dc' },
                timeScale: { borderColor: '#d1d4dc', timeVisible: true, secondsVisible: false },
                crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
            });

            const candlestickSeries = chart.addSeries(CandlestickSeries, {
                upColor: UP_COLOR,
                downColor: DOWN_COLOR,
                borderUpColor: '#008F28',
                borderDownColor: '#8A0000',
                wickUpColor: '#008F28',
                wickDownColor: '#8A0000',
                priceLineVisible: false,
                lastValueVisible: false,
            });
            candlestickSeries.setData(candleData);

            const lineSeries = chart.addSeries(LineSeries, {
                color: '#2962FF',
                lineWidth: 2,
                priceScaleId: 'right',
                priceLineVisible: false,
                lastValueVisible: false,
            });
            lineSeries.setData(lineData);

            chart.timeScale().fitContent();
        }, candleData, lineData, UP_COLOR, DOWN_COLOR);

        // 优化：等待渲染完成
        await page.evaluate(() => new Promise<void>(resolve => {
            requestAnimationFrame(() => setTimeout(resolve, 30));
        }));

        const element = await page.$('#container');
        if (!element) throw new Error('Container not found');

        const base64Buffer = await element.screenshot({ encoding: 'base64' });
        return base64Buffer;

    } catch (error) {
        logger.error('Error generating LWC chart:', error);
        throw error;
    } finally {
        if (releaseMutex!) releaseMutex();
    }
}
