import fs from 'fs';
import path from 'path';
import toml from 'toml';
import dotenv from 'dotenv';
import logger from './logger';

// 加载 .env 文件
dotenv.config();

export interface CandleConfig {
    micro_interval: string;
    trade_interval: string;
    macro_interval: string;
    micro_interval_count: number;
    trade_interval_count: number;
    macro_interval_count: number;
}

export interface EnvConfig {
    okx: {
        apiKey: string;
        apiSecret: string;
        apiPassphrase: string;
    };
    paper: {
        apiKey: string;
        apiSecret: string;
        apiPassphrase: string;
    };
    llm: {
        apiKey: string;
        baseUrl: string;
    };
}

export interface IndicatorConfig {
    ema: number;
}

export interface TradeConfig {
    paperTrade: boolean;
    risk: number; // 单笔交易最高风险，单位为%
}

export interface Config {
    candle: CandleConfig;
    env: EnvConfig;
    trade: TradeConfig;
    indicator: IndicatorConfig;
}

const CONFIG_FILE = path.join(process.cwd(), 'config.toml');

/**
 * 读取并解析 config.toml 配置文件，并合并环境变量
 */
export function loadConfig(): Config {
    try {
        // 读取 TOML 配置
        const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const tomlConfig = toml.parse(fileContent);

        // 组装环境变量配置
        const envConfig: EnvConfig = {
            okx: {
                apiKey: process.env.okx_api_key || '',
                apiSecret: process.env.okx_api_secret || '',
                apiPassphrase: process.env.okx_api_passphrase || '',
            },
            paper: {
                apiKey: process.env.paper_api_key || '',
                apiSecret: process.env.paper_api_secret || '',
                apiPassphrase: process.env.paper_api_passphrase || '',
            },
            llm: {
                apiKey: process.env.llm_api_key || '',
                baseUrl: process.env.llm_base_url || '',
            },
        };

        // 解析 llm 配置
        const llmConfig = tomlConfig.llm || {};
        const visualModel = llmConfig.visual_model || 'gpt-4o-mini';
        const simpleAnalysisModel = llmConfig.simple_analysis_model || 'gpt-3.5-turbo';
        const mainModel = llmConfig.main_model || 'gpt-4o-mini';

        // 解析 indicator 配置
        const indicatorConfig = tomlConfig.indicator || {};
        const ema = indicatorConfig.ema || 20;
        const risk = indicatorConfig.risk || 2;
        
        // 组装主配置对象
        return {
            candle: tomlConfig.candle,
            env: envConfig,
            trade: {
                paperTrade: tomlConfig.trade?.paper_trade || false,
                risk,
            },
            indicator: {
                ema,
            },
        };
    } catch (error) {
        logger.error('读取或解析配置时出错:', error);
        throw error;
    }
}

// 导出单例配置对象
export const config = loadConfig();
