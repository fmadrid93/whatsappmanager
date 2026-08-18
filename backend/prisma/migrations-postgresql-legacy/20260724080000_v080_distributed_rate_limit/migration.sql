-- v0.8.0 distributed rate limit generated from prisma/schema.prisma.
-- Do not edit manually; update the schema and regenerate.
CREATE TABLE "RateLimitBucket" (
  "key" VARCHAR(191) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket" ("resetAt");

