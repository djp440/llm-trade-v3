# 交易功能接口文档

本文档描述了 `src/connect/trade.ts` 中封装的 OKX 交易功能函数。
所有交易默认使用**全仓模式 (Cross Margin)**。

## 1. 市价开仓 (openMarketOrder)

以市价买入或卖出指定数量的合约。

### 函数签名
```typescript
export async function openMarketOrder(
    symbol: string, 
    side: 'buy' | 'sell', 
    size: string
): Promise<any>
```

### 参数说明
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `symbol` | string | 是 | 交易对名称，例如 `BTC-USDT-SWAP` |
| `side` | 'buy' \| 'sell' | 是 | 交易方向：`buy` (买入/做多) 或 `sell` (卖出/做空) |
| `size` | string | 是 | 开仓数量（合约张数），例如 `"1"` |

### 返回值
返回 OKX API 的下单结果对象。

### 示例
```typescript
// 买入 1 张 BTC-USDT-SWAP
await openMarketOrder('BTC-USDT-SWAP', 'buy', '1');
```

---

## 2. 市价开仓带止盈止损 (openMarketOrderWithTPSL)

以市价开仓，并同时附带止损和（可选）止盈委托。

### 函数签名
```typescript
export async function openMarketOrderWithTPSL(
    symbol: string, 
    side: 'buy' | 'sell', 
    size: string, 
    slTriggerPx: string, 
    tpTriggerPx?: string
): Promise<any>
```

### 参数说明
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `symbol` | string | 是 | 交易对名称，例如 `BTC-USDT-SWAP` |
| `side` | 'buy' \| 'sell' | 是 | 交易方向 |
| `size` | string | 是 | 开仓数量（合约张数） |
| `slTriggerPx` | string | 是 | 止损触发价格 |
| `tpTriggerPx` | string | 否 | 止盈触发价格 |

### 行为说明
- 使用 OKX V5 `attachAlgoOrds` 功能。
- 止损和止盈均设置为**市价**触发（即触发后以市价平仓）。
- 触发价格类型为 `last` (最新成交价)。

### 示例
```typescript
// 买入 1 张，设置止损 90000，止盈 100000
await openMarketOrderWithTPSL('BTC-USDT-SWAP', 'buy', '1', '90000', '100000');
```

---

## 3. 一键市价平仓 (closeAllPositions)

市价平掉指定交易对的所有持仓。

### 函数签名
```typescript
export async function closeAllPositions(symbol: string): Promise<any>
```

### 参数说明
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `symbol` | string | 是 | 交易对名称，例如 `BTC-USDT-SWAP` |

### 行为说明
- 使用 OKX V5 `close-position` 接口。
- 指定 `mgnMode: 'cross'` (全仓模式)。
- 适用于单向持仓模式 (Net Mode)。

### 示例
```typescript
// 平掉所有 BTC-USDT-SWAP 持仓
await closeAllPositions('BTC-USDT-SWAP');
```
