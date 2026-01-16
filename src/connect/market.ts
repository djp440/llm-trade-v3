import { OKXExchange } from './exchange.js';
import { Instrument, IInstrumentData } from '../model/instrument.js';
import { Candle } from '../model/candle.js';
import logger from '../util/logger.js';

/**
 * 市场数据模块
 * 负责获取行情、产品信息等
 */

/**
 * 获取所有交易产品基础信息
 * GET /api/v5/public/instruments
 * 
 * @param instType 产品类型: SPOT, MARGIN, SWAP, FUTURES, OPTION
 * @param uly 标的指数，如 BTC-USD，仅适用于交割/永续/期权
 * @param instId 产品ID，如 BTC-USDT
 * @returns Instrument 对象数组
 */
export async function getInstruments(instType: string, uly?: string, instId?: string): Promise<Instrument[]> {
    try {
        const exchange = OKXExchange.getInstance();
        const params: any = {
            instType
        };

        if (uly) {
            params.uly = uly;
        }

        if (instId) {
            params.instId = instId;
        }

        const data = await exchange.request('GET', '/api/v5/public/instruments', params);

        if (Array.isArray(data)) {
            return data.map((item: IInstrumentData) => new Instrument(item));
        } else {
            logger.error(`获取交易产品信息失败: 返回数据格式不正确`);
            return [];
        }
    } catch (error) {
        logger.error(`获取交易产品信息异常: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * 获取 K 线数据
 * GET /api/v5/market/candles
 * 
 * @param instId 产品ID，如 BTC-USDT-SWAP
 * @param bar 时间粒度，默认 1m。支持：1m/3m/5m/15m/30m/1H/2H/4H/6H/12H/1D/1W/1M
 * @param limit 获取条数，默认 100，最大 100
 * @param after 请求此时间戳之前的数据（不包含）
 * @param before 请求此时间戳之后的数据（不包含）
 * @returns Candle 对象数组
 */
export async function getCandles(instId: string, bar: string = '1m', limit: number = 100, after?: string, before?: string): Promise<Candle[]> {
    const str_limit = limit.toString();
    try {
        const exchange = OKXExchange.getInstance();
        const params: any = {
            instId,
            bar,
            str_limit
        };

        if (after) {
            params.after = after;
        }

        if (before) {
            params.before = before;
        }

        const data = await exchange.request('GET', '/api/v5/market/candles', params);

        if (Array.isArray(data)) {
            // OKX 返回的数据是按时间倒序排列的（最新的在前面）
            return data.map((item: string[]) => new Candle(item));
        } else {
            logger.error(`获取K线数据失败: 返回数据格式不正确`);
            return [];
        }
    } catch (error) {
        logger.error(`获取K线数据异常: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
