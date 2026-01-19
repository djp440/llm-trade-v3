import { EventEmitter } from 'events';

// 创建一个全局事件发射器，用于 UI 监听日志
export const logEmitter = new EventEmitter();

// 定义 UI 日志事件名
export const LOG_EVENT = 'ui-log';

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    color?: string;
}
