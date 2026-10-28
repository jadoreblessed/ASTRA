import { pino } from "pino";
import { config, isProd } from "./config.js";

export const log = pino({
  level: config.LOG_LEVEL,
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }),
  redact: {
    paths: ["secret", "*.secret", "secretKey", "*.secretKey", "MASTER_KEY", "*.privateKey", "ciphertext"],
    censor: "[redacted]",
  },
});
