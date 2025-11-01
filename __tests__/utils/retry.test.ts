import { calculateBackoff, retryWithBackoff, sleep } from '../../src/utils/retry';
import { RetryConfig } from '../../src/types';

describe('Retry Utils', () => {
  describe('calculateBackoff', () => {
    const config: RetryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
    };

    it('should calculate exponential backoff', () => {
      expect(calculateBackoff(0, config)).toBe(1000); // 1000 * 2^0
      expect(calculateBackoff(1, config)).toBe(2000); // 1000 * 2^1
      expect(calculateBackoff(2, config)).toBe(4000); // 1000 * 2^2
      expect(calculateBackoff(3, config)).toBe(8000); // 1000 * 2^3
    });

    it('should respect max delay', () => {
      expect(calculateBackoff(10, config)).toBe(30000); // Capped at maxDelay
    });

    it('should use default max delay if not specified', () => {
      const configWithoutMax: RetryConfig = {
        maxRetries: 3,
        baseDelay: 1000,
      };
      expect(calculateBackoff(10, configWithoutMax)).toBe(30000);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow small variance
    });
  });

  describe('retryWithBackoff', () => {
    const config: RetryConfig = {
      maxRetries: 3,
      baseDelay: 10, // Small delay for tests
    };

    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn, config);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, config);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fail'));

      await expect(retryWithBackoff(fn, config)).rejects.toThrow('always fail');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
