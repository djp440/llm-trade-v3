import { okx } from 'ccxt';
import { config } from '../util/config.js';
import logger from '../util/logger.js';

/**
 * OKX 交易所连接封装类
 * 支持合约账户模式、模拟盘切换、单向持仓设置及杠杆配置
 */
export class OKXExchange {
    private static instance: OKXExchange;
    private client: okx;
    private isPaper: boolean;

    private constructor() {
        this.isPaper = config.trade.paperTrade;

        const apiConfig = this.isPaper ? config.env.paper : config.env.okx;

        if (!apiConfig.apiKey || !apiConfig.apiSecret || !apiConfig.apiPassphrase) {
            const mode = this.isPaper ? '模拟盘' : '实盘';
            throw new Error(`未配置 OKX ${mode} API 密钥信息`);
        }

        this.client = new okx({
            apiKey: apiConfig.apiKey,
            secret: apiConfig.apiSecret,
            password: apiConfig.apiPassphrase,
            // 启用模拟盘模式
            options: {
                'defaultType': 'swap', // 默认合约模式
            }
        });

        // 如果是模拟盘，设置沙盒模式
        if (this.isPaper) {
            this.client.setSandboxMode(true);
            logger.info('OKX 交易所已启用模拟盘模式');
        } else {
            logger.info('OKX 交易所已启用实盘模式');
        }
    }

    /**
     * 获取 OKXExchange 单例实例
     */
    public static getInstance(): OKXExchange {
        if (!OKXExchange.instance) {
            OKXExchange.instance = new OKXExchange();
        }
        return OKXExchange.instance;
    }

    /**
     * 初始化账户设置：单向持仓和杠杆
     * @param symbol 交易对，例如 'BTC/USDT:USDT'
     */
    async initAccountSettings(symbol: string) {
        try {
            // 1. 设置持仓模式为单向持仓 (long_short_mode: false 表示单向)
            // OKX API: setPositionMode(longShortMode, params)
            // ccxt 统一接口可能是 setPositionMode
            try {
                await this.client.setPositionMode(false);
                logger.info(`OKX 持仓模式已设置为单向持仓`);
            } catch (e: any) {
                // 如果已经设置过或者不支持，捕获异常并记录
                if (e.message.includes('Position mode does not need to be changed')) {
                    logger.info('OKX 持仓模式已经是单向持仓');
                } else {
                    logger.warn(`设置单向持仓模式失败: ${e.message}`);
                }
            }

            // 2. 设置杠杆倍数
            const leverage = config.trade.level;
            try {
                // setLeverage(leverage, symbol, params)
                await this.client.setLeverage(leverage, symbol);
                logger.info(`OKX 交易对 ${symbol} 杠杆已设置为 ${leverage}x`);
            } catch (e: any) {
                logger.warn(`设置杠杆倍数失败: ${e.message}`);
            }

        } catch (error) {
            logger.error('初始化 OKX 账户设置时出错:', error);
            throw error;
        }
    }

    /**
     * 获取客户端实例
     */
    getRawClient(): okx {
        return this.client;
    }

    /**
     * 获取余额
     */
    async getBalance() {
        try {
            return await this.client.fetchBalance();
        } catch (error) {
            logger.error('获取余额失败:', error);
            throw error;
        }
    }
}

// 导出单例对象
export const okxExchange = OKXExchange.getInstance();
