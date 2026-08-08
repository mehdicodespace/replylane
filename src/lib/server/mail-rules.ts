import type { Classification, MailInput } from "../domain";

// Only unmistakable transactional subjects. A hiring-related term always wins.
export function knownServiceMail(mail: MailInput): Classification | null {
  const subject = mail.subject.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (
    /application|applied|interview|assessment|offer|recruit|hiring|candidate|bewerbung|vorstellung|einladung|absage|zusage|رزومه|استخدام|مصاحبه|همکاری|نتیجه|دعوت/.test(
      subject,
    )
  )
    return null;
  if (
    !/^(?:(?:your |\d{4,8} (?:is your )?)(?:verification code|login code|sign.in code|security code)|verify your email(?: address)?(?:$|[!:. ])|confirm your email(?: address)?(?:$|[!:. ])|(?:reset your password|password reset request|your password (?:has been |was )?reset)(?:$|[!:. ])|(?:your order confirmation|order receipt|your receipt from|payment receipt)(?:$|[!:. ])|(?:کد (?:ورود|تایید|تأیید|فعال.?سازی)|(?:تایید|تأیید) (?:ایمیل|آدرس ایمیل)|بازیابی (?:رمز عبور|گذرواژه)|فعال.?سازی حساب کاربری)(?:$|[\s:!؛])|(?:passwort zurücksetzen|bestätige deine e.mail|dein bestätigungscode)(?:$|[\s:!]))/.test(
      subject,
    )
  )
    return null;
  return {
    relevant: false,
    relevanceConfidence: 1,
    status: "review",
    confidence: 1,
    company: "Unknown company",
    role: "Role not specified",
    language: "und",
    summary: "",
    nextAction: "",
    deadline: null,
  };
}
