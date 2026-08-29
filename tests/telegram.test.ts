import { afterEach, describe, expect, it, vi } from "vitest";
import {
  telegramConfigured,
  telegramLocalPollingEnabled,
  validateTelegramSecret,
} from "@/lib/server/telegram";

afterEach(() => vi.unstubAllEnvs());

describe("Telegram connection security", () => {
  it("accepts only the configured webhook secret", () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "a-random_secret-123");
    expect(validateTelegramSecret("a-random_secret-123")).toBe(true);
    expect(validateTelegramSecret("a-random_secret-124")).toBe(false);
    expect(validateTelegramSecret(null)).toBe(false);
  });

  it("requires all server credentials before enabling the integration", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "replylane_bot");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "secret-123");
    expect(telegramConfigured()).toBe(true);
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect(telegramConfigured()).toBe(false);
  });

  it("enables Telegram long polling only for a local development URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(telegramLocalPollingEnabled()).toBe(true);
    vi.stubEnv("APP_URL", "https://replylane.example");
    expect(telegramLocalPollingEnabled()).toBe(false);
    vi.stubEnv("APP_URL", "http://192.168.1.20:3000");
    expect(telegramLocalPollingEnabled()).toBe(false);
  });
});
