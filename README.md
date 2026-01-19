# llm-trade-v3

**llm-trade-v3** 是一个基于 LLM（大语言模型）的加密货币自动交易系统。它利用多周期 K 线数据、技术指标（EMA）以及图表视觉分析，结合先进的 LLM 推理能力（OpenAI/Gemini），实现全自动的趋势跟踪与交易决策。

## 🚀 功能特性

*   **多周期分析**：同时监控微观（Micro）、交易（Trade）、宏观（Macro）三个时间周期的市场走势。
*   **多模态融合**：结合数值数据（OHLCV + EMA）与视觉图表（K 线图截图），提供更全面的市场认知。
*   **LLM 驱动决策**：
    *   使用视觉模型（如 Gemini Flash）分析 K 线形态与结构。
    *   使用推理模型（如 GPT-OSS）进行深度数据分析与威科夫理论研判。
    *   综合多方信息输出最终交易决策（开多/开空/平仓/观望）。
*   **智能风控**：实时监控账户维持保证金率与持仓风险，动态调整止损与仓位。
*   **历史记忆压缩**：将历史决策压缩为简短摘要，为当前决策提供上下文记忆。
*   **多线程架构**：支持多币种并行运行，每个交易对运行在独立的 Worker 线程中。

## 🛠️ 安装与运行

### 前置要求

*   Node.js (v18+)
*   npm 或 yarn
*   OKX 交易所 API Key (需要 V5 API)
*   OpenAI/Google Gemini API Key

### 安装依赖

```bash
npm install
```

### 配置

1.  复制环境变量示例文件：
    ```bash
    cp .env.example .env
    ```
2.  编辑 `.env` 文件，填入 API Key 等敏感信息。
3.  复制并编辑配置文件：
    ```bash
    cp config.example.toml config.toml
    ```
4.  编辑 `config.toml` 文件，调整交易参数与模型配置：
    *   `[candle]`：设置 K 线周期（如 1H, 4H, 1D）。
    *   `[trade]`：设置交易对、杠杆倍数、风险比例。
    *   `[llm]`：选择使用的大模型及其参数。

### 运行

开发模式（使用 ts-node）：
```bash
npm start
```

构建并运行：
```bash
npm run build
node dist/index.js
```

## 🧩 系统架构与流程

本系统采用主从架构，主进程负责初始化与 Worker 调度，子进程负责具体的策略执行。

### 核心运行流程图

```mermaid
graph TD
    Start[启动程序 npm start] --> Main[src/index.ts 主进程]
    
    subgraph Initialization [初始化阶段]
        Main --> SelfCheck[自检程序]
        SelfCheck --> CheckExchange[测试 OKX 连接]
        SelfCheck --> CheckLLM[测试 LLM 连接]
        CheckExchange -- 失败 --> Exit[退出程序]
        CheckLLM -- 失败 --> Exit
    end

    Initialization -- 通过 --> LoadConfig[加载配置 config.toml]
    LoadConfig --> LoopSymbols[遍历配置的交易对 Symbols]
    
    subgraph WorkerSpawning [多线程调度]
        LoopSymbols -->|Symbol A| SpawnWorkerA[启动 Worker A]
        LoopSymbols -->|Symbol B| SpawnWorkerB[启动 Worker B]
    end

    subgraph StrategyWorker [Worker 线程: src/core/run_strategy.ts]
        SpawnWorkerA --> StrategyLoop{策略主循环}
        
        StrategyLoop --> Wait[等待 K 线收盘]
        Wait -->|时间到| FetchData[并行获取数据]
        
        FetchData -->|Micro/Trade/Macro| GetCandles[获取 OHLCV]
        
        subgraph Analysis [多模态并行分析]
            GetCandles --> AnalyzeInterval[周期分析]
            AnalyzeInterval --> CalcEMA[计算 EMA 指标]
            AnalyzeInterval --> DrawChart[绘制 LWC 图表]
            
            DrawChart -->|图像| VisionLLM[视觉模型分析]
            CalcEMA -->|数据| DataLLM[数据模型分析]
            
            GetCandles --> RiskAnalysis[账户风控分析]
        end
        
        VisionLLM & DataLLM & RiskAnalysis --> Aggregate[汇总分析结果]
        Aggregate --> DecisionLLM[最终决策 LLM]
        
        DecisionLLM --> ExecuteTrade[执行交易]
        ExecuteTrade --> TradeAction[下单/撤单/修改止损]
        
        DecisionLLM --> CompressHistory[压缩决策记录]
        CompressHistory --> SaveHistory[保存至历史上下文]
        
        TradeAction --> StrategyLoop
        SaveHistory --> StrategyLoop
    end
```

### 目录结构

*   `src/index.ts`: 程序入口，负责自检与 Worker 启动。
*   `src/core/`: 核心逻辑目录。
    *   `run_strategy.ts`: 策略主循环，协调数据获取与分析。
    *   `analyze_functions.ts`: 调用 LLM 进行分析的具体实现。
    *   `trade_functions.ts`: 交易执行逻辑。
*   `src/connect/`: 外部连接器。
    *   `exchange.ts`: OKX API 封装。
    *   `openai.ts`: LLM 接口封装。
*   `src/util/`: 工具函数（绘图、指标计算、配置读取等）。
*   `config.toml`: 全局配置文件。

## 📄 许可证

ISC
