import fs from 'fs';
import path from 'path';
import toml from 'toml';
import dotenv from 'dotenv';

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

export interface Config {
    candle: CandleConfig;
    env: EnvConfig;
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

        return {
            candle: tomlConfig.candle,
            env: envConfig,
        };
    } catch (error) {
        console.error('Error reading or parsing config:', error);
        throw error;
    }
}

// 导出单例配置对象
export const config = loadConfig();
