import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatTelegramNotification,
  telegramConfigured,
  telegramLocalPollingEnabled,
  validateTelegramSecret,
} from "@/lib/server/telegram";

afterEach(() => vi.unstubAllEnvs());

describe("Telegram connection security", () => {
  it("formats reply alerts with a clear status color and compact details", () => {
    vi.stubEnv("APP_URL", "https://replylane.example");
    const message = formatTelegramNotification({
      company: "Adyen",
      role: "Frontend Developer",
      status: "offer",
      summary: "We'd love you to join the team.",
    });

    expect(message).toContain("🟢 OFFER RECEIVED");
    expect(message).toContain("🏢 Adyen");
    expect(message).toContain("💼 Frontend Developer");
    expect(message).toContain("📝 WHAT IT SAYS\nWe'd love you to join the team.");
    expect(message).toContain("↗ Open your applications: https://replylane.example");
  });

  it("uses distinct status colors for rejection and review alerts", () => {
    vi.stubEnv("APP_URL", "https://replylane.example");
    expect(formatTelegramNotification({ status: "rejected" })).toContain("🔴 REJECTION");
    expect(formatTelegramNotification({ status: "review" })).toContain("🟡 NEEDS A QUICK REVIEW");
  });

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

  it("enables Telegram long polling for loopback URLs in local production previews", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(telegramLocalPollingEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(telegramLocalPollingEnabled()).toBe(true);
    vi.stubEnv("APP_URL", "https://replylane.example");
    expect(telegramLocalPollingEnabled()).toBe(false);
    vi.stubEnv("APP_URL", "http://192.168.1.20:3000");
    expect(telegramLocalPollingEnabled()).toBe(false);
    vi.stubEnv("APP_URL", "http://[::1]:3000");
    expect(telegramLocalPollingEnabled()).toBe(true);
  });
});
