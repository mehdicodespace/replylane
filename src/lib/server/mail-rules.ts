import type { Classification, MailInput } from "../domain";

const irrelevant = (): Classification => ({
  relevant: false,
  relevanceConfidence: 0.99,
  status: "review",
  confidence: 0.99,
  company: "Unknown company",
  role: "Role not specified",
  language: "und",
  summary: "",
  nextAction: "",
  deadline: null,
});

// Keep obvious mail out of inference while sending uncertain cases to the
// multilingual classifier. Positive hiring context always takes precedence.
export function knownServiceMail(mail: MailInput): Classification | null {
  const subject = mail.subject.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const hiringSubject =
    /application|applied|interview|assessment|offer|recruit|hiring|candidate|bewerbung|vorstellung|einladung|absage|zusage|رزومه|استخدام|مصاحبه|همکاری|نتیجه|دعوت/.test(
      subject,
    );
  if (hiringSubject) return null;

  const transactional =
    /^(?:(?:your |\d{4,8} (?:is your )?)(?:verification code|login code|sign.in code|security code)|verify your email(?: address)?(?:$|[!:. ])|confirm your email(?: address)?(?:$|[!:. ])|(?:reset your password|password reset request|your password (?:has been |was )?reset)(?:$|[!:. ])|(?:your order confirmation|order receipt|your receipt from|payment receipt)(?:$|[!:. ])|(?:کد (?:ورود|تایید|تأیید|فعال.?سازی)|(?:تایید|تأیید) (?:ایمیل|آدرس ایمیل)|بازیابی (?:رمز عبور|گذرواژه)|فعال.?سازی حساب کاربری)(?:$|[\s:!؛])|(?:passwort zurücksetzen|bestätige deine e.mail|dein bestätigungscode)(?:$|[\s:!]))/.test(
      subject,
    );
  const jobDigest =
    /^(?:your )?(?:weekly )?(?:job alert|job matches|job recommendations|jobs matching|new jobs for you|career digest|job digest|jobs newsletter|employment newsletter|stellenangebote|jobangebote|neue jobs für dich|neue stellen für dich|newsletter|فرصت.?های شغلی جدید|پیشنهاد.?های شغلی|خبرنامه|آگهی.?های شغلی جدید)(?:$|[\s:!؛-])/.test(
      subject,
    );
  if (transactional || jobDigest) return irrelevant();

  const hiringContext =
    /application|applied|resume|curriculum vitae|candidate|interview|assessment|offer|recruit(?:er|ing|ment)|hiring|position|job title|bewerbung|lebenslauf|vorstellungsgespräch|bewerber|einladung|absage|zusage|مصاحبه|رزومه|درخواست|موقعیت شغلی|استخدام|همکاری|پذیرش|ارزیابی|وظیفه|entrevista|candidatura|postulación|recrutement|entretien|応募|面接|职位|面试|السيرة الذاتية|مقابلة|توظيف/i.test(
      `${mail.subject}\n${mail.text.slice(0, 1200)}`,
    );
  const bulkSignals =
    /unsubscribe|email preferences|view in browser|weekly digest|marketing email|special offer|top stories|trending now|recommended for you|nieuwsbrief|abmelden|abonnement|خبرنامه|لغو اشتراک|إلغاء الاشتراك/i.test(
      mail.text.slice(-1800),
    );
  if (!hiringContext && bulkSignals) return irrelevant();

  return null;
}
