export function emailDirection(text: string, language = ""): "rtl" | "ltr" {
  if (/^(fa|ar|he|ur)(-|$)/i.test(language)) return "rtl";
  return (text.match(/[\u0590-\u08ff]/g)?.length || 0) > 15 ||
    /^[^\p{L}]*[\u0590-\u08ff]/u.test(text)
    ? "rtl"
    : "ltr";
}
export function cleanEmailText(text: string) {
  return text
    .replace(/\[https?:\/\/[^\]\s]+\]/g, "")
    .replace(/https?:\/\/[^\s]{160,}/g, "[link]")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function emailDocument(html: string, direction: "rtl" | "ltr", images: boolean) {
  const csp = `default-src 'none'; img-src ${images ? "https: data:" : "'none'"}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none';`;
  return `<!doctype html><html dir="${direction}"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:18px;background:#fff;color:#202a40;font:14px/1.8 Tahoma,Arial,sans-serif;overflow-wrap:anywhere}table{max-width:100%!important}img{max-width:100%!important;height:auto}a{color:#315fd3;overflow-wrap:anywhere}pre{white-space:pre-wrap}blockquote{margin-inline:12px}td{overflow-wrap:anywhere}</style></head><body>${html}</body></html>`;
}
