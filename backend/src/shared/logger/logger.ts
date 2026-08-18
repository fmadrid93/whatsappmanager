import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "refreshToken",
      "accessToken",
      "authorization",
      "req.headers.authorization",
      "request.headers.authorization",
      "AWS_SECRET_ACCESS_KEY",
      "mediaKey",
      "*.mediaKey",
      "*.credentials",
      "*.creds",
      "*.payload",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
});
