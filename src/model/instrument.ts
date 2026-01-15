/**
 * 交易产品基础信息接口，对应 OKX API 返回的数据结构
 * 参考: https://www.okx.com/docs-v5/zh/#public-data-rest-api-get-instruments
 */
export interface IInstrumentData {
    instType: string;   // 产品类型
    instId: string;     // 产品ID
    uly: string;        // 标的指数
    category: string;   // 手续费档位
    baseCcy: string;    // 交易货币
    quoteCcy: string;   // 计价货币
    settleCcy: string;  // 盈亏结算货币
    ctVal: string;      // 合约面值
    ctMult: string;     // 合约乘数
    ctValCcy: string;   // 合约面值计价货币
    optType: string;    // 期权类型
    stk: string;        // 行权价格
    listTime: string;   // 上线时间
    expTime: string;    // 到期时间
    lever: string;      // 该产品支持的最大杠杆倍数
    tickSz: string;     // 下单价格精度
    lotSz: string;      // 下单数量精度
    minSz: string;      // 最小下单数量
    ctType: string;     // 合约类型: linear(正向), inverse(反向)
    alias: string;      // 合约别名
    state: string;      // 产品状态
    maxLmtSz: string;   // 合约或现货限价单的单笔最大委托数量
    maxMktSz: string;   // 合约或现货市价单的单笔最大委托数量
    maxLmtAmt: string;  // 现货限价单的单笔最大委托金额
    maxMktAmt: string;  // 现货市价单的单笔最大委托金额
    maxTwapSz: string;  // 时间加权单单笔最大委托数量
    maxIcebergSz: string; // 冰山单单笔最大委托数量
    maxTriggerSz: string; // 计划委托单单笔最大委托数量
    maxStopSz: string;    // 止盈止损单单笔最大委托数量
}

/**
 * 交易产品类，封装基础信息
 */
export class Instrument {
    public readonly instType: string;
    public readonly instId: string;
    public readonly uly: string;
    public readonly category: string;
    public readonly baseCcy: string;
    public readonly quoteCcy: string;
    public readonly settleCcy: string;
    public readonly ctVal: number;
    public readonly ctMult: number;
    public readonly ctValCcy: string;
    public readonly optType: string;
    public readonly stk: number;
    public readonly listTime: number;
    public readonly expTime: number | null;
    public readonly lever: number;
    public readonly tickSz: number;
    public readonly lotSz: number;
    public readonly minSz: number;
    public readonly ctType: string;
    public readonly alias: string;
    public readonly state: string;

    constructor(data: IInstrumentData) {
        this.instType = data.instType;
        this.instId = data.instId;
        this.uly = data.uly;
        this.category = data.category;
        this.baseCcy = data.baseCcy;
        this.quoteCcy = data.quoteCcy;
        this.settleCcy = data.settleCcy;
        this.ctVal = Number(data.ctVal || 0);
        this.ctMult = Number(data.ctMult || 1);
        this.ctValCcy = data.ctValCcy;
        this.optType = data.optType;
        this.stk = Number(data.stk || 0);
        this.listTime = Number(data.listTime);
        this.expTime = data.expTime ? Number(data.expTime) : null;
        this.lever = Number(data.lever || 1);
        this.tickSz = Number(data.tickSz);
        this.lotSz = Number(data.lotSz);
        this.minSz = Number(data.minSz);
        this.ctType = data.ctType;
        this.alias = data.alias;
        this.state = data.state;
    }

    /**
     * 获取产品 ID
     */
    getInstId(): string {
        return this.instId;
    }

    /**
     * 检查是否为可用状态
     */
    isLive(): boolean {
        return this.state === 'live';
    }

    /**
     * 格式化输出
     */
    toString(): string {
        return `Instrument: [ID: ${this.instId}, Type: ${this.instType}, State: ${this.state}]`;
    }
}
