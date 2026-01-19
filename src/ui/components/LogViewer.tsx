import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { logEmitter, LOG_EVENT, LogEntry } from '../../util/log_emitter.js';

interface Props {
    height?: number | string;
}

export const LogViewer: React.FC<Props> = ({ height = '100%' }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    // 保留最近 N 条日志以节省内存
    const MAX_LOGS = 100;

    useEffect(() => {
        const handleLog = (entry: LogEntry) => {
            setLogs(prev => {
                const newLogs = [...prev, entry];
                if (newLogs.length > MAX_LOGS) {
                    return newLogs.slice(newLogs.length - MAX_LOGS);
                }
                return newLogs;
            });
        };

        logEmitter.on(LOG_EVENT, handleLog);

        return () => {
            logEmitter.off(LOG_EVENT, handleLog);
        };
    }, []);

    return (
        <Box 
            flexDirection="column" 
            height={height} 
            borderStyle="single" 
            borderColor="gray" 
            paddingX={1}
            overflow="hidden" // 隐藏溢出内容（虽然 Ink 处理滚动比较麻烦，但这是基础）
        >
            {logs.map((log, index) => {
                // 简单的颜色映射
                let color = 'white';
                if (log.level === 'info') color = 'green';
                if (log.level === 'warn') color = 'yellow';
                if (log.level === 'error') color = 'red';
                if (log.color) color = log.color; // 优先使用自定义颜色

                return (
                    <Box key={index}>
                        <Text color="gray">[{log.timestamp}] </Text>
                        <Text color={color} bold>{log.level.toUpperCase().padEnd(7)}: </Text>
                        <Text color={color}>{log.message}</Text>
                    </Box>
                );
            })}
        </Box>
    );
};
