import crypto from 'crypto-js';
import { config } from '../util/config.js';
import logger from '../util/logger.js';
import { Balance } from '../model/balance.js';
import { Position } from '../model/position.js';

/**
 * OKX 交易所连接封装类 (原生 API V5 实现)
 * 移除对 ccxt 的依赖，采用 fetch 进行 API 调用
 */
export class OKXExchange {
    private static instance: OKXExchange;
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly apiPassphrase: string;
    private readonly isPaper: boolean;
    private readonly baseUrl: string = 'https://www.okx.com';

    private constructor() {
        this.isPaper = config.trade.paperTrade;
        const apiConfig = this.isPaper ? config.env.paper : config.env.okx;

        if (!apiConfig.apiKey || !apiConfig.apiSecret || !apiConfig.apiPassphrase) {
            const mode = this.isPaper ? '模拟盘' : '实盘';
            throw new Error(`未配置 OKX ${mode} API 密钥信息`);
        }

        this.apiKey = apiConfig.apiKey;
        this.apiSecret = apiConfig.apiSecret;
        this.apiPassphrase = apiConfig.apiPassphrase;

        if (this.isPaper) {
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
     * 生成 OKX API 签名
     */
    private generateSignature(timestamp: string, method: string, requestPath: string, body: string = ''): string {
        const message = timestamp + method.toUpperCase() + requestPath + body;
        const hash = crypto.HmacSHA256(message, this.apiSecret);
        return crypto.enc.Base64.stringify(hash);
    }

    /**
     * 发送经过身份验证的请求
     */
    public async request(method: string, path: string, params: any = null): Promise<any> {
        const timestamp = new Date().toISOString();
        let requestPath = path;
        let body = '';

        if (method.toUpperCase() === 'GET' && params) {
            const query = new URLSearchParams(params).toString();
            requestPath += `?${query}`;
        } else if (params) {
            body = JSON.stringify(params);
        }

        const signature = this.generateSignature(timestamp, method, requestPath, body);

        const headers: Record<string, string> = {
            'OK-ACCESS-KEY': this.apiKey,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': this.apiPassphrase,
            'Content-Type': 'application/json',
        };

        if (this.isPaper) {
            headers['x-simulated-trading'] = '1';
        }

        const url = `${this.baseUrl}${requestPath}`;

        try {
            const response = await fetch(url, {
                method: method.toUpperCase(),
                headers,
                body: method.toUpperCase() !== 'GET' ? body : undefined,
            });

            const result = await response.json();

            if (result.code !== '0') {
                logger.error(`OKX API 错误详情: ${JSON.stringify(result)}`);
                throw new Error(`OKX API Error: ${result.msg} (code: ${result.code})`);
            }

            return result.data;
        } catch (error: any) {
            logger.error(`OKX 请求失败 [${method} ${path}]: ${error.message}`);
            throw error;
        }
    }

    /**
     * 初始化账户设置：单向持仓和杠杆
     * @param symbol 交易对，例如 'BTC-USDT-SWAP'
     */
    async initAccountSettings(symbol: string) {
        try {
            // 1. 设置持仓模式为单向持仓 (net: 单向持仓, long_short: 双向持仓)
            try {
                // OKX API: /api/v5/account/set-position-mode
                await this.request('POST', '/api/v5/account/set-position-mode', {
                    posMode: 'net_mode'
                });
                logger.info(`OKX 持仓模式已设置为单向持仓`);
            } catch (e: any) {
                // 忽略 "无需更改" 的错误
                if (e.message.includes('not need to be changed') || e.message.includes('80012')) {
                    logger.info('OKX 持仓模式已经是单向持仓');
                } else {
                    logger.warn(`设置单向持仓模式失败: ${e.message}`);
                }
            }

            // 2. 设置杠杆倍数
            const leverage = config.trade.level.toString();
            try {
                // OKX API: /api/v5/account/set-leverage
                // 注意: OKX 原生接口 symbol 格式通常是 BTC-USDT-SWAP
                const formattedSymbol = symbol.replace('/', '-').replace(':USDT', '');
                await this.request('POST', '/api/v5/account/set-leverage', {
                    instId: formattedSymbol,
                    lever: leverage,
                    mgnMode: 'cross' // 默认全仓
                });
                logger.info(`OKX 交易对 ${formattedSymbol} 杠杆已设置为 ${leverage}x`);
            } catch (e: any) {
                logger.warn(`设置杠杆倍数失败: ${e.message}`);
            }

        } catch (error) {
            logger.error('初始化 OKX 账户设置时出错:', error);
            throw error;
        }
    }

    /**
     * 下单
     * @param params 下单参数
     */
    async placeOrder(params: any): Promise<any> {
        try {
            // OKX API: /api/v5/trade/order
            const data = await this.request('POST', '/api/v5/trade/order', params);
            return data;
        } catch (error) {
            logger.error('下单失败:', error);
            throw error;
        }
    }

    /**
     * 市价平仓
     * @param params 平仓参数
     */
    async closePosition(params: any): Promise<any> {
        try {
            // OKX API: /api/v5/trade/close-position
            const data = await this.request('POST', '/api/v5/trade/close-position', params);
            return data;
        } catch (error) {
            logger.error('平仓失败:', error);
            throw error;
        }
    }

    /**
     * 获取指定币种的余额
     * @param currency 币种名称，默认 USDT
     */
    async getBalance(currency: string = 'USDT'): Promise<Balance> {
        try {
            // OKX API: /api/v5/account/balance
            const data = await this.request('GET', '/api/v5/account/balance', { ccy: currency });

            if (!data || data.length === 0) {
                logger.warn(`未找到币种 ${currency} 的余额信息`);
                return new Balance({ free: 0, used: 0, total: 0 });
            }

            const details = data[0].details;
            const asset = details.find((d: any) => d.ccy === currency);

            if (!asset) {
                logger.warn(`未找到币种 ${currency} 的详细余额`);
                return new Balance({ free: 0, used: 0, total: 0 });
            }

            // OKX V5 结构: 
            // availBal: 可用余额
            // frozenBal: 冻结余额
            // eq: 币种总权益
            return new Balance({
                free: parseFloat(asset.availBal || '0'),
                used: parseFloat(asset.frozenBal || '0'),
                total: parseFloat(asset.eq || '0')
            });
        } catch (error) {
            logger.error('获取余额失败:', error);
            throw error;
        }
    }

    /**
     * 获取持仓信息
     * @param instType 产品类型，默认 SWAP (永续合约)
     * @param instId 产品 ID，如 BTC-USDT-SWAP
     */
    async getPositions(instType: string = 'SWAP', instId?: string): Promise<Position[]> {
        try {
            const params: any = { instType };
            if (instId) {
                params.instId = instId;
            }

            // OKX API: /api/v5/account/positions
            const data = await this.request('GET', '/api/v5/account/positions', params);

            if (!data || !Array.isArray(data)) {
                return [];
            }

            return data.map((pos: any) => new Position(pos));
        } catch (error) {
            logger.error('获取持仓信息失败:', error);
            throw error;
        }
    }
}

// 导出单例对象
export const okxExchange = OKXExchange.getInstance();
