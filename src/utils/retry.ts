import { RetryConfig } from '../types';

/**
 * Calculate exponential backoff delay
 */
export const calculateBackoff = (attempt: number, config: RetryConfig): number => {
  const delay = config.baseDelay * Math.pow(2, attempt);
  const maxDelay = config.maxDelay || 30000; // Default max 30 seconds
  return Math.min(delay, maxDelay);
};

/**
 * Sleep for a specified duration
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on last attempt
      if (attempt === config.maxRetries - 1) {
        break;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError!;
}
