import winston from 'winston';
import chalk from 'chalk';
import dayjs from 'dayjs';
import path from 'path';
import fs from 'fs';

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

// 自定义控制台输出格式
const consoleFormat = winston.format.printf(({ level, message, timestamp, color }) => {
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
        // 控制台输出
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                consoleFormat
            ),
        }),
        // 文件输出
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
