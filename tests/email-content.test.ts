import { describe, expect, it } from "vitest";
import { cleanEmailText, emailDirection, emailDocument } from "@/lib/email-content";
import { sanitizeEmailHTML } from "@/lib/server/email-html";
describe("email presentation boundaries", () => {
  it("keeps tables, safe inline formatting, images and Persian direction", () => {
    const html = sanitizeEmailHTML(
      '<table dir="rtl" width="600"><tr><td style="color:#333;padding:12px;text-align:right">دعوت به مصاحبه<img src="https://example.com/logo.png" width="120" height="40"></td></tr></table>',
    );
    expect(html).toContain('<table dir="rtl" width="600">');
    expect(html).toContain("https://example.com/logo.png");
    expect(html).toContain("padding:12px");
    expect(emailDirection("Jobvision\nدعوت به مصاحبه برای موقعیت شغلی", "fa")).toBe("rtl");
    expect(emailDirection("A German interview", "de")).toBe("ltr");
  });
  it("strips active content, unsafe image payloads and tiny tracking pixels", () => {
    const html = sanitizeEmailHTML(
      '<script>secret()</script><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="secret"></form><a href="javascript:alert(1)" onclick="steal()">Open</a><img src="data:image/svg+xml;base64,AAA" onerror="steal()"><img src="https://tracker.example/pixel" width="1" height="1"><div style="background-color:url(https://evil.example/track);position:fixed">Hello</div>',
    );
    expect(html).not.toMatch(
      /<script|<iframe|<form|<input|javascript:|onclick|onerror|data:image\/svg|tracker.example|position:|url\(/,
    );
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("removes converted image/tracking URL clutter while preserving the message", () => {
    const text = cleanEmailText(
      "Jobvision [https://example.com/logo.png]\n\nسلام، رزومه شما بررسی شد.\n\n[" +
        "https://tracker.example/" +
        "x".repeat(200) +
        "]",
    );
    expect(text).toContain("رزومه شما بررسی شد");
    expect(text).not.toContain("https://");
  });
  it("isolates the formatted document and can block all external images", () => {
    const doc = emailDocument('<p dir="rtl">سلام</p>', "rtl", false);
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("img-src 'none'");
    expect(doc).toContain("form-action 'none'");
    expect(doc).toContain('name="referrer" content="no-referrer"');
    expect(doc).toContain('<html dir="rtl">');
  });
});
