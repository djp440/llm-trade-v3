import React from 'react';
import { Box, Text } from 'ink';
import { BotStatus } from '../../core/bot_manager.js';

interface Props {
    status: BotStatus;
}

export const StatusHeader: React.FC<Props> = ({ status }) => {
    let color = 'red';
    let icon = '🔴';
    
    if (status === BotStatus.RUNNING) {
        color = 'green';
        icon = '🟢';
    }

    return (
        <Box borderStyle="round" borderColor={color} paddingX={1} marginBottom={1}>
            <Text bold color={color}>
                {icon} LLM Trade Bot V3 - Status: {status}
            </Text>
        </Box>
    );
};
