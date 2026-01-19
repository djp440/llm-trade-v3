import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import logger from './util/logger.js';

// 捕获未处理的异常，防止程序直接崩溃
process.on('uncaughtException', (err) => {
    // 这里使用 console.error 可能是因为 logger 可能也会抛错，或者我们希望确保输出
    // 但为了统一，我们尝试用 logger
    try {
        logger.error('Uncaught Exception:', err);
    } catch (e) {
        console.error('Uncaught Exception (Logger failed):', err);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    try {
        logger.error('Unhandled Rejection:', reason);
    } catch (e) {
        console.error('Unhandled Rejection:', reason);
    }
});

// 清屏（可选，为了更好的 UI 体验）
// console.clear();

// 启动 UI
render(React.createElement(App));
