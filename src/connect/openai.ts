import OpenAI from 'openai';
import { config } from '../util/config.js';
import logger from '../util/logger.js';

/**
 * OpenAI 连接封装类
 */
export class OpenAIConnector {
    private static instance: OpenAIConnector;
    private client: OpenAI;

    private constructor() {
        if (!config.env.llm.apiKey) {
            throw new Error('没有找到OPENAI API KEY');
        }

        this.client = new OpenAI({
            apiKey: config.env.llm.apiKey,
            baseURL: config.env.llm.baseUrl || undefined,
        });
    }

    /**
     * 获取 OpenAIConnector 单例实例
     */
    public static getInstance(): OpenAIConnector {
        if (!OpenAIConnector.instance) {
            OpenAIConnector.instance = new OpenAIConnector();
        }
        return OpenAIConnector.instance;
    }

    /**
     * 通用聊天函数
     * @param systemPrompt 系统提示词
     * @param userPrompt 用户提示词
     * @param model 使用的模型名称
     * @returns 模型返回的内容
     */
    async chat(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: config.llm.temperature,
            });

            const content = response.choices[0]?.message?.content || '';
            if (!content) {
                logger.warn(`OpenAI 模型 ${model} 返回内容为空`);
            }
            return content;
        } catch (error) {
            logger.error(`OpenAI 模型 ${model} 聊天出错:`, error);
            throw error;
        }
    }

    /**
     * 图像分析函数
     * @param systemPrompt 系统提示词
     * @param userPrompt 用户提示词
     * @param imageUrl 图像 URL 或 Base64 编码的图像数据
     * @param model 使用的模型名称 (默认为 visual_model)
     * @returns 模型返回的内容
     */
    async analyzeImage(
        systemPrompt: string,
        userPrompt: string,
        imageUrl: string,
        model: string = config.llm.visual_model
    ): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: userPrompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl.startsWith('http') ? imageUrl : `data:image/jpeg;base64,${imageUrl}`,
                                },
                            },
                        ],
                    },
                ],
                temperature: config.llm.temperature,
            });

            const content = response.choices[0]?.message?.content || '';
            if (!content) {
                logger.warn(`OpenAI 模型 ${model} 图像分析返回内容为空`);
            }
            return content;
        } catch (error) {
            logger.error(`OpenAI 模型 ${model} 图像分析出错:`, error);
            throw error;
        }
    }

    /**
     * 专门用于主分析模型的 JSON 输出聊天
     * @param systemPrompt 系统提示词
     * @param userPrompt 用户提示词
     * @returns 解析后的 JSON 对象
     */
    async chatWithJson(systemPrompt: string, userPrompt: string): Promise<any> {
        const model = config.llm.main_model;
        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: config.llm.temperature,
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0]?.message?.content || '{}';
            try {
                return JSON.parse(content);
            } catch (e) {
                logger.error('解析 OpenAI 返回的 JSON 失败:', content);
                throw new Error('LLM 返回的 JSON 格式无效');
            }
        } catch (error) {
            logger.error(`OpenAI 模型 ${model} JSON 聊天出错:`, error);
            throw error;
        }
    }
}

// 导出单例对象
export const openaiConnector = OpenAIConnector.getInstance();
