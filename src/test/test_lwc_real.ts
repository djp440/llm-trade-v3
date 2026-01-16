import fs from 'fs';
import path from 'path';

async function runRealDataTest() {
    try {
        console.log('Importing modules...');
        const { calculateEMA } = await import('../util/indicator.js');
        const { drawKLineChartLWC } = await import('../util/draw_lwc.js');
        const { getCandles } = await import('../connect/market.js');
        const { default: logger } = await import('../util/logger.js');

        const symbol = 'BTC-USDT-SWAP';
        const period = '1D';
        const limit = 200;

        logger.info(`Fetching ${limit} candles for ${symbol} (${period})...`);
        const candles = await getCandles(symbol, period, limit);
        logger.info(`Fetched ${candles.length} candles.`);

        // EMA
        const emaData = calculateEMA(candles, 20);

        logger.info('Generating LWC chart...');
        const start = Date.now();
        // Generates PNG Base64
        const base64 = await drawKLineChartLWC(candles, emaData, period);
        const end = Date.now();
        
        logger.info(`Chart generated in ${end - start}ms. Base64 length: ${base64.length}`);

        // Save to file
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const filePath = path.join(outputDir, `test_lwc_real_${symbol}_${period}.png`);
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        logger.info(`Saved real data chart to ${filePath}`);

    } catch (err) {
        console.error('Error running real data test:', err);
    }
}

runRealDataTest();
