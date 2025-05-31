import { LRUCache } from "lru-cache";

interface RateLimitOptions {
  interval: number; // interval in milliseconds
  allowedRequests: number; // number of allowed requests per interval
}

export default function rateLimit(options: RateLimitOptions) {
  const tokenCache = new LRUCache<string, number[]>({
    max: 1000, // Max 1000 unique IPs
    ttl: options.interval,
  });

  return {
    check: (ip: string) => {
      const now = Date.now();
      const timestamps = tokenCache.get(ip) || [];

      // Remove timestamps outside the current interval
      const validTimestamps = timestamps.filter((ts: number) => now - ts < options.interval);

      if (validTimestamps.length >= options.allowedRequests) {
        tokenCache.set(ip, validTimestamps);
        return { isRateLimited: true };
      }

      validTimestamps.push(now);
      tokenCache.set(ip, validTimestamps);
      return { isRateLimited: false };
    },
  };
}
