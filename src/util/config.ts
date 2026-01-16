import fs from 'fs';
import path from 'path';
import toml from 'toml';
import dotenv from 'dotenv';
import logger from './logger.js';

// 加载 .env 文件
dotenv.config();

export interface CandleConfig {
  micro_interval: string;
  trade_interval: string;
  macro_interval: string;
  micro_interval_count: number;
  trade_interval_count: number;
  macro_interval_count: number;
  image_candle_count: number;
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
    level: number; // 杠杆倍数
    symbols: string[]; // 要运行的交易对
}

export interface LlmModelConfig {
    visual_model: string;
    simple_analysis_model: string;
    risk_analysis_model: string;
    main_model: string;
    temperature: number;
    reasoning_effort: string;
}

export interface Config {
    candle: CandleConfig;
    env: EnvConfig;
    trade: TradeConfig;
    indicator: IndicatorConfig;
    llm: LlmModelConfig;
    system_prompt: {
        visual: string;
        simple_analysis: string;
        risk_analysis: string;
        main: string;
    };
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
        const llmConfig: LlmModelConfig = {
            visual_model: tomlConfig.llm?.visual_model || 'gpt-4o-mini',
            simple_analysis_model: tomlConfig.llm?.simple_analysis_model || 'gpt-3.5-turbo',
            risk_analysis_model: tomlConfig.llm?.risk_analysis_model || 'gpt-3.5-turbo',
            main_model: tomlConfig.llm?.main_model || 'gpt-4o-mini',
            temperature: tomlConfig.llm?.temperature || 0.2,
            reasoning_effort: tomlConfig.llm?.reasoning_effort || 'medium',
        };

        // 解析 system_prompt 配置
        const systemPrompt = {
            visual: tomlConfig.system_prompt?.visual || '',
            simple_analysis: tomlConfig.system_prompt?.simple_analysis || '',
            risk_analysis: tomlConfig.system_prompt?.risk_analysis || '',
            main: tomlConfig.system_prompt?.main || '',
        };

        // 解析 indicator 配置
        const indicatorConfig = tomlConfig.indicator || {};
        const ema = indicatorConfig.ema || 20;
        const level = indicatorConfig.level || 3; // 杠杆倍数
        const risk = tomlConfig.trade?.risk || 2;

        // 组装主配置对象
        return {
            candle: tomlConfig.candle,
            env: envConfig,
            trade: {
                paperTrade: tomlConfig.trade?.paper_trade || false,
                risk,
                level,
                symbols: tomlConfig.trade?.symbols || [],
            },
            indicator: {
                ema,
            },
            llm: llmConfig,
            system_prompt: systemPrompt,
        };
    } catch (error) {
        logger.error('读取或解析配置时出错:', error);
        throw error;
    }
}

// 导出单例配置对象
export const config = loadConfig();
