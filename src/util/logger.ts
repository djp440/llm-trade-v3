import winston from 'winston';
import Transport from 'winston-transport';
import chalk from 'chalk';
import dayjs from 'dayjs';
import path from 'path';
import fs from 'fs';
import { parentPort, isMainThread } from 'worker_threads';
import { logEmitter, LOG_EVENT } from './log_emitter.js';

// 定义支持的颜色枚举
export enum LogColor {
    Red = 'red',
    Green = 'green',
    Yellow = 'yellow',
    Blue = 'blue',
    Magenta = 'magenta',
    Cyan = 'cyan',
    White = 'white',
    Gray = 'gray',
    Black = 'black',
    RedBright = 'redBright',
    GreenBright = 'greenBright',
    YellowBright = 'yellowBright',
    BlueBright = 'blueBright',
    MagentaBright = 'magentaBright',
    CyanBright = 'cyanBright',
    WhiteBright = 'whiteBright',
}

// 确保 logs 目录存在
const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// 生成精确到秒的文件名
const timestamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
const logFilePath = path.join(logsDir, `${timestamp}.log`);

// 定义日志级别对应的颜色
const colors = {
    error: chalk.red,
    warn: chalk.yellow,
    info: chalk.green,
    http: chalk.magenta,
    debug: chalk.white,
};

/**
 * 自定义 Transport，用于将日志发送到 UI 或父进程
 * 该 Transport 始终激活，不受 Console silence 影响
 */
class UiTransport extends Transport {
    constructor(opts?: Transport.TransportStreamOptions) {
        super(opts);
    }

    log(info: any, callback: () => void) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // 提取需要的数据
        const { level, message, timestamp, color } = info;
        // 如果没有 timestamp (虽然 format.combine 会加，但保险起见)，补一个
        const ts = timestamp || dayjs().format('HH:mm:ss');

        if (isMainThread) {
            // 主线程：直接 Emit 到 UI
            logEmitter.emit(LOG_EVENT, {
                timestamp: ts,
                level,
                message,
                color
            });
        } else if (parentPort) {
            // Worker 线程：发送给父进程
            parentPort.postMessage({
                type: 'log',
                payload: {
                    timestamp: ts,
                    level,
                    message,
                    color
                }
            });
        }

        callback();
    }
}

// 自定义控制台输出格式 (仅用于 Console Transport)
const consoleFormat = winston.format.printf(({ level, message, timestamp, color }) => {
    // 这里不再负责发送 UI 日志，只负责生成 Console 字符串
    const colorizer = colors[level as keyof typeof colors] || chalk.white;
    const timeStr = chalk.gray(`[${timestamp}]`);
    const levelStr = colorizer(level.toUpperCase().padEnd(7));

    let finalMessage = message;
    if (color && typeof color === 'string') {
        const chalkColor = (chalk as any)[color];
        if (typeof chalkColor === 'function') {
            finalMessage = chalkColor(message);
        }
    }

    return `${timeStr} ${levelStr}: ${finalMessage}`;
});

// 自定义文件输出格式（不包含颜色代码）
const fileFormat = winston.format.printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level.toUpperCase().padEnd(7)}: ${message}`;
});

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat()
    ),
    transports: [
        // 1. 自定义 UI Transport (始终激活)
        new UiTransport({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'HH:mm:ss' }) // 确保 info 对象里有短时间戳
            )
        }),

        // 2. 控制台输出 (UI 模式下静默)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                consoleFormat
            ),
            silent: process.env.UI_MODE === 'true' // 如果是 UI 模式，静默 Console 输出
        }),

        // 3. 文件输出
        new winston.transports.File({
            filename: logFilePath,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                fileFormat
            ),
        }),
    ],
});

export default logger;
