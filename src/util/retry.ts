import logger, { LogColor } from "./logger.js";

interface RetryOptions {
  maxRetries?: number;
  delay?: number; // ms
  backoff?: boolean; // 是否开启指数退避
  retryOn?: (error: any) => boolean;
  context?: string; // 上下文描述，用于日志
}

/**
 * 异步函数重试工具
 * @param fn 需要重试的异步函数
 * @param options 重试配置
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { 
    maxRetries = 3, 
    delay = 2000, 
    backoff = true,
    retryOn,
    context = "操作"
  } = options;
  
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        logger.error(`[${context}] 重试 ${maxRetries} 次后最终失败`, error);
        throw error;
      }

      if (retryOn && !retryOn(error)) {
        logger.error(`[${context}] 遇到不可重试错误，停止重试`, error);
        throw error;
      }

      const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
      
      logger.warn(
        `[${context}] 失败，${(waitTime / 1000).toFixed(1)}秒后进行第 ${attempt}/${maxRetries} 次重试... 错误: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { color: LogColor.Yellow }
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}
