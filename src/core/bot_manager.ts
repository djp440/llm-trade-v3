import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { config } from '../util/config.js';
import logger from '../util/logger.js';
import { OKXExchange } from '../connect/exchange.js';
import { OpenAIConnector } from '../connect/openai.js';

import { logEmitter, LOG_EVENT } from '../util/log_emitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export enum BotStatus {
    IDLE = 'IDLE',
    RUNNING = 'RUNNING',
    STOPPED = 'STOPPED', // Distinct from IDLE? Maybe IDLE is initial state.
}

export class BotManager extends EventEmitter {
    private static instance: BotManager;
    private workers: Map<string, Worker> = new Map();
    public status: BotStatus = BotStatus.IDLE;

    private constructor() {
        super();
    }

    public static getInstance(): BotManager {
        if (!BotManager.instance) {
            BotManager.instance = new BotManager();
        }
        return BotManager.instance;
    }

    private async runSelfCheck() {
        logger.info('开始执行自检程序...');

        // 1. 测试交易所连接
        try {
            logger.info('正在测试交易所连接...');
            const exchange = OKXExchange.getInstance();
            const balance = await exchange.getBalance('USDT');
            logger.info(`交易所连接成功，USDT 余额: ${balance.free} (可用), ${balance.total} (总额)`);
        } catch (error) {
            logger.error('交易所连接测试失败:', error);
            throw error;
        }

        // 2. 测试 LLM 连接
        try {
            logger.info('正在测试 LLM 连接...');
            const llm = OpenAIConnector.getInstance();
            const model = config.llm.simple_analysis_model;
            const testPrompt = 'Hello, this is a connection test. Reply "OK" if you receive this.';
            // max_tokens 10 to save cost
            const response = await llm.chat('You are a test assistant.', testPrompt, model, { max_tokens: 10 });
            logger.info(`LLM 连接成功，测试响应: ${response}`);
        } catch (error) {
            logger.error('LLM 连接测试失败:', error);
            throw error;
        }

        logger.info('自检程序通过，准备启动主逻辑...');
    }

    public async start() {
        if (this.status === BotStatus.RUNNING) {
            logger.warn('程序已在运行中');
            return;
        }

        try {
            await this.runSelfCheck();

            const symbols = config.trade.symbols;

            if (!symbols || symbols.length === 0) {
                const msg = '未配置交易对 (config.trade.symbols)';
                logger.error(msg);
                throw new Error(msg);
            }

            logger.info(`主程序启动，准备为 ${symbols.length} 个交易对启动策略线程...`);

            for (const symbol of symbols) {
                // run_strategy.ts 位于同级目录 (src/core/)
                const extension = path.extname(__filename);
                const workerPath = path.join(__dirname, `run_strategy${extension}`);

                logger.info(`正在启动 Worker: ${symbol}`);

                const execArgv = [...process.execArgv];
                // 如果是 .ts 文件，说明在开发环境运行 (tsx)，需要为 Worker 注入 tsx loader
                if (extension === '.ts') {
                    execArgv.push('--import', 'tsx');
                }

                const worker = new Worker(workerPath, {
                    workerData: { symbol },
                    execArgv: execArgv
                });

                worker.on('message', (msg) => {
                    // 处理来自 Worker 的日志消息
                    if (msg && msg.type === 'log' && msg.payload) {
                        logEmitter.emit(LOG_EVENT, msg.payload);
                    }
                });

                worker.on('error', (err) => {
                    logger.error(`[Worker ${symbol}] Error:`, err);
                });

                worker.on('exit', (code) => {
                    if (code !== 0) {
                        logger.error(`[Worker ${symbol}] Stopped with exit code ${code}`);
                    } else {
                        logger.info(`[Worker ${symbol}] Finished successfully`);
                    }
                    // 如果不是手动停止，可能需要从 workers 移除
                    // 但为了简单，我们在 stop() 中统一清理
                });

                this.workers.set(symbol, worker);
            }

            this.status = BotStatus.RUNNING;
            this.emit('status-change', this.status);
            logger.info('所有策略线程已启动');

        } catch (error) {
            logger.error('启动失败:', error);
            // 确保清理
            this.stop();
            throw error; // Re-throw so UI knows it failed
        }
    }

    public stop() {
        if (this.status !== BotStatus.RUNNING) return;

        logger.info('正在停止所有策略线程...');
        for (const [symbol, worker] of this.workers) {
            logger.info(`Terminating worker for ${symbol}`);
            worker.terminate();
        }
        this.workers.clear();
        this.status = BotStatus.IDLE; // or STOPPED
        this.emit('status-change', this.status);
        logger.info('所有策略线程已停止');
    }

    public pause() {
        // 当前版本，暂停 = 停止
        // 未来可以实现挂起逻辑
        logger.info('暂停运行 (执行停止操作)...');
        this.stop();
    }
}
