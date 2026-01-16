async function testVisualAnalysis() {
    try {
        console.log('Importing modules...');
        // 使用新的 Lightweight Charts 生成器
        const { drawKLineChartLWC } = await import('../util/draw_lwc.js');
        const { Candle } = await import('../model/candle.js');
        const { calculateEMA } = await import('../util/indicator.js');
        const { openaiConnector } = await import('../connect/openai.js');
        const { config } = await import('../util/config.js');
        const { default: logger } = await import('../util/logger.js');
        const fs = await import('fs');
        const path = await import('path');

        logger.info('开始视觉分析测试 (使用 Lightweight Charts)...');
        // 1. 获取真实k线数据
        const period = '1D';
        const { getCandles } = await import('../connect/market.js');
        // 获取的数据通常是倒序的 (最新 -> 最旧)
        const candles: any[] = await getCandles('BTC-USDT-SWAP', period, 200);

        // calculateEMA 现在会自动处理倒序数据
        const emaData = calculateEMA(candles, 20);

        // 2. 绘制图表并获取 Base64
        logger.info('正在生成 K 线图表 Base64...');
        const base64Chart = await drawKLineChartLWC(candles, emaData, period);
        logger.info(`图表已生成，Base64 长度: ${base64Chart.length}`);

        // 保存图片以便查看
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const filePath = path.join(outputDir, 'test_visual_analysis.png');
        fs.writeFileSync(filePath, Buffer.from(base64Chart, 'base64'));
        logger.info(`图表已保存至: ${filePath}`);

        // 3. 调用 LLM 进行分析
        const systemPrompt = config.system_prompt.visual || '你是一个专业的加密货币交易员。请分析提供的 K 线图表，关注趋势、EMA 均线和成交量。';
        const userPrompt = `这是最新的 BTC-USDT ${period} K 线图，请分析当前市场走势并给出交易建议。`;

        logger.info(`正在调用模型 ${config.llm.visual_model} 进行分析...`);
        const analysis = await openaiConnector.analyzeImage(
            systemPrompt,
            userPrompt,
            base64Chart
        );

        logger.info('--- LLM 分析结果 ---');
        console.log(analysis);
        logger.info('-------------------');

    } catch (error) {
        console.error('视觉分析测试失败:', error);
    }
}

testVisualAnalysis();
