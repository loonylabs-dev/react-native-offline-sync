/**
 * Get current Unix timestamp in milliseconds
 */
export const now = (): number => {
  return Date.now();
};

/**
 * Get current Unix timestamp in seconds
 */
export const nowInSeconds = (): number => {
  return Math.floor(Date.now() / 1000);
};

/**
 * Convert milliseconds to seconds
 */
export const msToSeconds = (ms: number): number => {
  return Math.floor(ms / 1000);
};

/**
 * Convert seconds to milliseconds
 */
export const secondsToMs = (seconds: number): number => {
  return seconds * 1000;
};

/**
 * Check if a timestamp is older than a given duration
 */
export const isOlderThan = (timestamp: number, durationMs: number): boolean => {
  return Date.now() - timestamp > durationMs;
};

/**
 * Format timestamp for display
 */
export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toISOString();
};
