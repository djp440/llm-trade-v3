import { OKXExchange } from './exchange.js';
import { Instrument, IInstrumentData } from '../model/instrument.js';
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
