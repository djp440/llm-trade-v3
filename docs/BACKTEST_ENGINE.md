# 回测引擎设计文档（与现有运行逻辑一致）

## 目标
构建一个与当前实盘运行逻辑严格一致的回测引擎，确保同一套策略在回测与实盘下的时间驱动、数据选取、分析流程、风控信息与交易语义一致，从而得到可比较、可复现实验结果。

## 现有运行逻辑映射
当前实盘核心流程由主进程启动与策略线程循环组成：
- 启动与自检：[index.ts](file:///f:/project/llm-trade-v3/src/index.ts)
- 策略循环与决策逻辑：[run_strategy.ts](file:///f:/project/llm-trade-v3/src/core/run_strategy.ts)
- 分析与决策：[analyze_functions.ts](file:///f:/project/llm-trade-v3/src/core/analyze_functions.ts)
- 交易执行：[trade_functions.ts](file:///f:/project/llm-trade-v3/src/core/trade_functions.ts)
- 市价与止损执行：[trade.ts](file:///f:/project/llm-trade-v3/src/connect/trade.ts)
- 行情获取：[market.ts](file:///f:/project/llm-trade-v3/src/connect/market.ts)

逻辑要点：
- 以 trade_interval 对齐整点的方式调度，每个周期收盘后触发一次策略分析与交易。
- 每次分析时并行获取 micro/trade/macro 三个周期的 K 线，并额外拉取 image_candle_count 用于绘图。
- 获取到的 K 线先剔除未收盘的第一根，再进行 EMA、图像与 OHLCV 并行分析。
- 风险分析依赖账户余额、持仓与止损委托信息。
- 决策由 LLM 主模型给出 JSON 结果，随后交易模块执行 ENTRY/EXIT/UPDATE_STOP_LOSS/NO_OP。

关键一致性细节：
- getDecision 中先 shift 一根未收盘 K 线，再对 OHLCV 分析使用 candles.slice(1, count + 1)。回测必须保留这一行为以保持一致。
- EMA 与 ATR 对倒序数据有特殊处理，回测必须维持相同的 K 线排序与处理方式：[indicator.ts](file:///f:/project/llm-trade-v3/src/util/indicator.ts)
- 交易的语义与动作集必须与 LLMAnalysisResult 一致：[llm_result.ts](file:///f:/project/llm-trade-v3/src/model/llm_result.ts)

## 回测引擎总体设计
回测引擎应当以“同样的策略流程、不同的数据与执行环境”为原则，尽量复用分析与决策逻辑，仅替换行情、账户与交易执行依赖。

### 核心模块
1. 数据源适配器
   - 读取历史 K 线数据，提供与 getCandles 等价的接口。
   - 统一输出 Candle 结构，保证字段与时间戳精度一致。

2. 时间驱动器
   - 以 trade_interval 的整点收盘时间为驱动，逐步推进回测时间。
   - 在每个回测时间点提供“当前可用历史数据切片”。

3. 账户与持仓模型
   - 维护余额、保证金、杠杆、持仓方向与数量。
   - 维护止损委托池，支持 UPDATE_STOP_LOSS 与触发检查。

4. 交易执行器
   - 实现 openMarketOrder / openMarketOrderWithTPSL / closeAllPositions / updateStopLoss 等行为语义。
   - 执行价格使用一致的规则（建议默认使用 trade_interval 收盘价，或可配置为下一根微周期开盘价）。

5. 风险分析适配器
   - 用模拟账户状态生成与实盘一致的风险文本输入。
   - 结构与实盘 risk_analysis 的输入字段一致。

6. LLM 决策适配器
   - 支持两种模式：
     - 在线模式：直接调用 LLM，保证与实盘一致的决策行为。
     - 复现模式：缓存/回放 LLM 输出，保证回测结果可重复。

7. 结果记录与评估
   - 记录每个回测时点的输入、决策、成交、资金曲线、风险指标。
   - 输出可用于复现与审计的日志与统计摘要。

## 关键流程设计
### 初始化
1. 读取 config.toml 的 candle、trade、indicator 与 llm 配置。
2. 初始化数据源、账户与持仓模型。
3. 确定回测起止时间与交易对列表。

### 每个 trade_interval 收盘时的循环
1. 构造 timeIndex（当前回测时间点）。
2. 为 micro/trade/macro 分别获取 count + image_candle_count 的历史 K 线切片。
3. 对每个周期剔除未收盘 K 线，并保持与实盘一致的数据顺序。
4. 并行执行：
   - 计算 EMA 并生成图像（可在复现模式关闭图像生成）。
   - 运行图像分析与 OHLCV 分析。
   - 生成风险分析输入并调用风险模型。
5. 拼接 allAnalysis，调用决策模型，得到 LLMAnalysisResult。
6. 交易执行器根据 action 执行，更新账户与持仓。
7. 记录本周期数据与结果。

### 时间与数据对齐规则
- trade_interval 的触发点以 K 线收盘时间为准，与实盘 getIntervalMs 的整点逻辑一致。
- 数据对齐使用当前时点之前的已收盘 K 线。
- 对倒序 K 线调用 calculateEMA 时保持与实盘一致的排序规则。

## 与现有逻辑一致的接口设计
为了尽量复用现有策略逻辑，建议提供与 OKXExchange/OpenAIConnector 等价的接口形态：

```ts
export interface BacktestMarket {
  getCandles(instId: string, bar: string, limit: number, after?: string, before?: string): Promise<Candle[]>;
}

export interface BacktestExchange {
  getBalance(): Promise<Balance>;
  getPositions(instType: string, instId: string): Promise<Position[]>;
  getPendingAlgoOrders(instId: string, algoType: string): Promise<any[]>;
  placeOrder(params: any): Promise<any>;
  closePosition(params: any): Promise<any>;
}

export interface BacktestLLM {
  analyzeImage(systemPrompt: string, userPrompt: string, imageUrl: string): Promise<string>;
  chat(systemPrompt: string, userPrompt: string, model: string): Promise<string>;
  chatWithJson(systemPrompt: string, userPrompt: string): Promise<any>;
}
```

在回测入口中替换单例依赖，让 run_strategy 的核心逻辑可以复用或镜像实现。

## 执行语义一致性规则
- ENTRY_LONG / ENTRY_SHORT：必须有 quantity 与 stopLoss，否则视为无效开仓。
- EXIT_LONG / EXIT_SHORT：平掉当前交易对全部持仓。
- UPDATE_STOP_LOSS：只更新止损触发价格，与实盘一致地从未完成策略单中筛选止损单。
- NO_OP：无操作。

对应逻辑可对照：[trade_functions.ts](file:///f:/project/llm-trade-v3/src/core/trade_functions.ts) 与 [trade.ts](file:///f:/project/llm-trade-v3/src/connect/trade.ts)

## 回测指标与输出
建议最少包含以下输出，以便与实盘行为对比：
- 资金曲线与回撤
- 持仓方向与换手次数
- 每次决策的输入与输出快照
- 止损触发统计与风险提示分布

## 复现性与一致性策略
- 将 LLM 输入与输出写入缓存（以 symbol+timestamp+analysisHash 为键）。
- 回测模式默认使用缓存回放，避免随机性与模型变化。
- 在需要与实盘完全一致时启用在线模式，并锁定模型与温度参数。

## 实施步骤建议
1. 抽象行情、交易、风控与 LLM 适配接口。
2. 实现历史数据源与撮合器，保证与实盘动作语义一致。
3. 实现回测运行器，按 trade_interval 推进并驱动策略逻辑。
4. 加入决策缓存与回放机制，保证可复现。
5. 形成回测结果报告与可视化输出。

## 验收要点
- 回测逻辑中每一步的数据切片与实盘一致。
- LLM 输入文本结构一致，含相同字段顺序与格式。
- 行为动作与实盘执行语义一致。
- 回测结果可复现且可追踪。
