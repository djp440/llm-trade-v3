import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { BotManager, BotStatus } from '../core/bot_manager.js';
import { StatusHeader } from './components/StatusHeader.js';
import { LogViewer } from './components/LogViewer.js';

const bot = BotManager.getInstance();

export const App = () => {
    const { exit } = useApp();
    const [status, setStatus] = useState<BotStatus>(bot.status);
    const [message, setMessage] = useState<string>('');

    // 设置 UI 模式环境变量，让 logger 静默 console 输出
    useEffect(() => {
        process.env.UI_MODE = 'true';
        return () => {
            process.env.UI_MODE = 'false';
        };
    }, []);

    useEffect(() => {
        const onStatusChange = (newStatus: BotStatus) => {
            setStatus(newStatus);
        };
        bot.on('status-change', onStatusChange);
        return () => {
            bot.off('status-change', onStatusChange);
        };
    }, []);

    const handleSelect = async (item: { value: string; label: string }) => {
        setMessage('');

        switch (item.value) {
            case 'start':
                if (status === BotStatus.RUNNING) {
                    setMessage('⚠️ 程序已经在运行中');
                } else {
                    setMessage('正在启动...');
                    try {
                        // 不 await，让 UI 保持响应，日志会在 LogViewer 显示
                        bot.start().then(() => {
                            setMessage('✅ 启动成功');
                        }).catch((e: any) => {
                            setMessage(`❌ 启动失败: ${e.message}`);
                        });
                    } catch (e: any) {
                        setMessage(`❌ 启动失败: ${e.message}`);
                    }
                }
                break;
            case 'pause':
                if (status !== BotStatus.RUNNING) {
                    setMessage('⚠️ 程序未运行，无法暂停');
                } else {
                    bot.pause();
                    setMessage('⏸️ 程序已暂停 (Worker 已停止)');
                }
                break;
            case 'exit':
                if (status === BotStatus.RUNNING) {
                    bot.stop();
                }
                exit();
                process.exit(0);
                break;
        }
    };

    const items = [
        { label: '开始运行程序', value: 'start' },
        { label: '暂停运行程序', value: 'pause' },
        { label: '退出程序', value: 'exit' },
    ];

    return (
        <Box flexDirection="column" height="100%">
            {/* 顶部状态栏 */}
            <StatusHeader status={status} />

            {/* 中间日志区域，占据剩余空间 */}
            <Box flexGrow={1} minHeight={10}>
                <LogViewer />
            </Box>

            {/* 底部控制区 */}
            <Box flexDirection="column" padding={1} borderStyle="round" borderColor="blue">
                <Box marginBottom={1}>
                    <Text bold>控制台操作:</Text>
                </Box>

                {/* 使用 Box 包裹 SelectInput 以确保它在底部区域内正确渲染 */}
                <Box>
                    <SelectInput items={items} onSelect={handleSelect} />
                </Box>

                {message ? (
                    <Box marginTop={1}>
                        <Text color="yellow">{message}</Text>
                    </Box>
                ) : null}
            </Box>
        </Box>
    );
};
