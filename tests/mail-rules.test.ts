import { describe, expect, it } from "vitest";
import { knownServiceMail } from "@/lib/server/mail-rules";
import type { MailInput } from "@/lib/domain";
const mail = (subject: string) => ({ subject }) as MailInput;
describe("conservative service mail shortcuts", () => {
  it.each([
    "Your verification code",
    "123456 is your verification code",
    "Reset your password",
    "Your receipt from Example",
    "کد ورود به حساب",
    "بازیابی رمز عبور",
    "Passwort zurücksetzen",
  ])("excludes clear account traffic: %s", (subject) =>
    expect(knownServiceMail(mail(subject))?.relevant).toBe(false),
  );
  it.each([
    "Your application confirmation",
    "Your interview security code",
    "Thank you",
    "We have an update",
    "نتیجه درخواست همکاری",
    "Einladung zum Vorstellungsgespräch",
    "Re: Your verification code",
    "Order confirmation specialist application",
    "Please verify your application",
  ])("keeps possible hiring responses for classification: %s", (subject) =>
    expect(knownServiceMail(mail(subject))).toBeNull(),
  );
});
