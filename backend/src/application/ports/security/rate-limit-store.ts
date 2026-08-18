export interface RateLimitConsumeInput {
  key: string;
  now: Date;
  windowMs: number;
}

export interface RateLimitConsumeResult {
  count: number;
  resetAt: Date;
}

export interface IRateLimitStore {
  consume(input: RateLimitConsumeInput): Promise<RateLimitConsumeResult>;
}
