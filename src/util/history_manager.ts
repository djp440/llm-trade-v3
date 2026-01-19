import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import logger from './logger.js';

const HISTORY_FILE = path.join(process.cwd(), 'compress.md');

/**
 * 确保历史文件存在
 */
function ensureHistoryFile() {
    if (!fs.existsSync(HISTORY_FILE)) {
        fs.writeFileSync(HISTORY_FILE, '', 'utf-8');
    }
}

/**
 * 读取历史决策记录
 * @returns 历史记录字符串
 */
export function readHistory(): string {
    ensureHistoryFile();
    try {
        const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
        return content.trim();
    } catch (error) {
        logger.error('读取历史记录失败:', error);
        return '';
    }
}

/**
 * 添加新的历史决策记录
 * @param record 压缩后的决策记录
 */
export function appendHistory(record: string) {
    ensureHistoryFile();
    try {
        let content = fs.readFileSync(HISTORY_FILE, 'utf-8');
        let lines = content.split('\n').filter(line => line.trim() !== '');
        
        // 添加新记录
        lines.push(record);

        // 检查是否超过最大行数
        const maxLines = config.llm.max_compress;
        if (lines.length > maxLines) {
            // 丢弃最旧的数据
            lines = lines.slice(lines.length - maxLines);
        }

        // 重新写入文件
        fs.writeFileSync(HISTORY_FILE, lines.join('\n') + '\n', 'utf-8');
        logger.info('已更新历史决策记录');
    } catch (error) {
        logger.error('写入历史记录失败:', error);
    }
}
