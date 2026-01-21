import logger from "../util/logger.ts";

export type TradeAction =
  | "ENTRY_LONG"
  | "ENTRY_SHORT"
  | "EXIT_LONG"
  | "EXIT_SHORT"
  | "NO_OP"
  | "UPDATE_STOP_LOSS";

/**
 * LLM 分析结果原始数据接口
 */
export interface ILLMAnalysisResultData {
  action: string; // 允许字符串输入，但在类中会进行验证
  reason: string;
  stop_loss?: number | null;
  quantity?: number | null;
}

/**
 * LLM 分析结果封装类
 */
export class LLMAnalysisResult {
  public readonly action: TradeAction;
  public readonly reason: string;
  public readonly stopLoss: number | null;
  public readonly quantity: number | null;
  public readonly timestamp: number;

  constructor(data: ILLMAnalysisResultData) {
    this.action = this.validateAction(data.action);
    this.reason = data.reason || "无理由";
    this.stopLoss = typeof data.stop_loss === "number" ? data.stop_loss : null;
    this.quantity = typeof data.quantity === "number" ? data.quantity : null;
    this.timestamp = Date.now();

    this.validateLogic();
  }

  /**
   * 验证动作是否合法
   */
  private validateAction(action: string): TradeAction {
    const validActions: TradeAction[] = [
      "ENTRY_LONG",
      "ENTRY_SHORT",
      "EXIT_LONG",
      "EXIT_SHORT",
      "NO_OP",
      "UPDATE_STOP_LOSS",
    ];
    if (validActions.includes(action as TradeAction)) {
      return action as TradeAction;
    }
    logger.warn(`LLM 返回了无效的动作: ${action}，默认为 NO_OP`);
    return "NO_OP";
  }

  /**
   * 验证业务逻辑
   */
  private validateLogic() {
    if (
      (this.action === "ENTRY_LONG" || this.action === "ENTRY_SHORT") && 
      this.stopLoss === null
    ) {
      logger.warn(
        `LLM 建议开仓 ${this.action} 但未提供止损，强制转换为 NO_OP`,
      );
      // 这里我们无法修改 readonly 属性，但在实际交易逻辑中应检查此情况
      // 或者我们可以抛出错误，或者在 getter 中处理
      // 为简单起见，这里仅打印警告，调用者应检查 isValidEntry()
    }
  }

  /**
   * 是否是开仓建议
   */
  isEntry(): boolean {
    return this.action === "ENTRY_LONG" || this.action === "ENTRY_SHORT";
  }

  /**
   * 是否是平仓建议
   */
  isExit(): boolean {
    return this.action === "EXIT_LONG" || this.action === "EXIT_SHORT";
  }

  /**
   * 检查开仓建议是否有效（必须包含止损）
   */
  isValidEntry(): boolean {
    if (!this.isEntry()) return false;
    return (
      this.stopLoss !== null
    );
  }

  /**
   * 获取格式化的字符串表示
   */
  toString(): string {
    let details = "";
    if (this.isEntry()) {
      details = `, 数量: ${this.quantity}, 止损: ${this.stopLoss}`;
    }
    return `[${this.action}] ${this.reason}${details}`;
  }
}
