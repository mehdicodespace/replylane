import { afterEach, describe, expect, it, vi } from "vitest";
import { telegramConfigured, validateTelegramSecret } from "@/lib/server/telegram";

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
});
