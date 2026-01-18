import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { config } from "../util/config.js";
import logger from "../util/logger.js";
import { getCandles } from "../connect/market.js";
import { calculateEMA } from "../util/indicator.js";
import { formatCandlesWithEma } from "../util/format.js";
import { Candle } from "../model/candle.js";

async function generateOhlcvPromptMarkdown() {
    const symbols = config.trade.symbols;
    const symbol = symbols && symbols.length > 0 ? symbols[0] : "BTC-USDT-SWAP";
    const interval = config.candle.trade_interval;
    const limit = config.candle.trade_interval_count || 100;

    logger.info(`开始获取真实K线数据，交易对: ${symbol}，周期: ${interval}`);

    try {
        const candles: Candle[] = await getCandles(symbol, interval, limit);

        if (!candles || candles.length === 0) {
            logger.warn("未获取到任何K线数据，无法生成Prompt");
            return;
        }

        logger.info(`已获取到 ${candles.length} 条K线数据`);

        const emaPeriod = config.indicator.ema;
        const ema = calculateEMA(candles, emaPeriod);

        logger.info(`已计算 EMA${emaPeriod} 数据`);

        const formattedData = formatCandlesWithEma(candles, ema);

        const systemPrompt = config.system_prompt.simple_analysis;
        const userPrompt = `以下为${interval}周期的ohlcv+ema数据。\n` + formattedData;

        const outputDir = path.resolve(process.cwd(), "output");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            logger.info("已创建 output 目录");
        }

        const timestamp = dayjs().format("YYYYMMDD_HHmmss");
        const safeSymbol = symbol.replace(/[:/]/g, "-");
        const fileName = `ohlcv_prompt_${safeSymbol}_${interval}_${timestamp}.md`;
        const filePath = path.join(outputDir, fileName);

        const contentLines: string[] = [];
        contentLines.push("# System Prompt");
        contentLines.push("");
        contentLines.push(systemPrompt);
        contentLines.push("");
        contentLines.push("# User Prompt");
        contentLines.push("");
        contentLines.push("```");
        contentLines.push(userPrompt);
        contentLines.push("```");
        contentLines.push("");

        fs.writeFileSync(filePath, contentLines.join("\n"), "utf-8");

        logger.info(`Prompt 已写入 Markdown 文件: ${filePath}`);
    } catch (error: any) {
        logger.error(`生成 Prompt Markdown 文件失败: ${error.message || String(error)}`);
    }
}

generateOhlcvPromptMarkdown();

