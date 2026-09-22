export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many contact submissions");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type RateLimitEntry = { count: number; resetAt: number };

export class BoundedRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly maxAttempts = 3, private readonly windowMs = 60 * 60 * 1000) {}

  consume(key: string, now = Date.now()): void {
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    if (current.count >= this.maxAttempts) {
      throw new RateLimitError(Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
    }
    current.count += 1;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const inquiryRateLimiter = new BoundedRateLimiter();
