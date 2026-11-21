// Sliding-window limiter, per key (the client IP). Only accepted requests should call hit().

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly options: RateLimitOptions) {}

  /** True when the key has used up its allowance in the current window. Records nothing. */
  blocked(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.options.windowMs);
    this.hits.set(key, recent);
    return recent.length >= this.options.max;
  }

  hit(key: string, now: number): void {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.options.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
  }
}
