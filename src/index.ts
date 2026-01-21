import logger from './util/logger.ts';
import { BotManager } from './core/bot_manager.ts';

// 捕获未处理的异常
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

async function main() {
    const bot = BotManager.getInstance();
    
    logger.info('正在启动 LLM Trade Bot V3 (Terminal Mode)...');
    
    // 注册退出信号
    const handleExit = () => {
        logger.info('接收到退出信号，正在停止...');
        bot.stop();
        // 给一点时间让日志写完
        setTimeout(() => process.exit(0), 500);
    };
    
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);

    try {
        await bot.start();
        logger.info('系统已启动。按 Ctrl+C 停止。');
    } catch (error) {
        logger.error('启动失败:', error);
        process.exit(1);
    }
}

main();
