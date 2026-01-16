import fs from 'fs';
import path from 'path';

async function runTest() {
    try {
        console.log('Importing modules...');
        const { Candle } = await import('../model/candle.js');
        const { calculateEMA } = await import('../util/indicator.js');
        const { drawKLineChartLWC } = await import('../util/draw_lwc.js');

        // Mock Candle data
        const mockCandles: any[] = [];
        let price = 50000;
        const now = Date.now(); // ms

        // Generate 100 candles
        for (let i = 0; i < 100; i++) {
            const ts = now - (100 - i) * 60000; // past to present
            const change = (Math.random() - 0.5) * 200;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * 50;
            const low = Math.min(open, close) - Math.random() * 50;
            const vol = Math.random() * 100;

            price = close;

            // [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
            const data = [
                ts.toString(),
                open.toString(),
                high.toString(),
                low.toString(),
                close.toString(),
                vol.toString(),
                '0', '0', '1'
            ];
            mockCandles.push(new Candle(data));
        }

        const emaData = calculateEMA(mockCandles, 20);

        console.log('Generating chart with LWC...');
        const start = Date.now();
        const base64 = await drawKLineChartLWC(mockCandles, emaData, '1m');
        const end = Date.now();
        
        console.log(`Chart generated in ${end - start}ms. Base64 length: ${base64.length}`);

        // Save to file
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const filePath = path.join(outputDir, 'test_lwc.png');
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        console.log(`Saved chart to ${filePath}`);

    } catch (err) {
        console.error('Error running test:', err);
    }
}

runTest();
