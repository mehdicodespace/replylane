import sanitizeHtml from "sanitize-html";

export function sanitizeEmailHTML(html: string) {
  const values = [/^[\w\s.,#%()!'"\-\u0600-\u06ff]+$/u];
  const styles = Object.fromEntries(
    [
      "color",
      "background-color",
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "line-height",
      "text-align",
      "text-decoration",
      "direction",
      "display",
      "vertical-align",
      "table-layout",
      "width",
      "max-width",
      "min-width",
      "height",
      "max-height",
      "padding",
      "padding-top",
      "padding-bottom",
      "padding-left",
      "padding-right",
      "margin",
      "margin-top",
      "margin-bottom",
      "margin-left",
      "margin-right",
      "border",
      "border-width",
      "border-style",
      "border-color",
      "border-radius",
      "border-collapse",
    ].map((key) => [key, values]),
  );
  return sanitizeHtml(html.slice(0, 150000), {
    allowedTags: [
      "div",
      "span",
      "p",
      "br",
      "hr",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "a",
      "img",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "caption",
      "colgroup",
      "col",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "small",
      "sup",
      "sub",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "center",
      "font",
    ],
    allowedAttributes: {
      "*": ["dir", "lang", "style", "align"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      table: ["width", "cellpadding", "cellspacing", "border", "bgcolor", "role"],
      td: ["colspan", "rowspan", "width", "height", "bgcolor", "valign"],
      th: ["colspan", "rowspan"],
      font: ["color", "size", "face"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: { img: ["https", "data"] },
    allowProtocolRelative: false,
    allowedStyles: { "*": styles },
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: { ...attrs, target: "_blank", rel: "noopener noreferrer" },
      }),
      img: (_tag, attrs) => {
        if (
          attrs.src?.startsWith("data:") &&
          !/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(attrs.src)
        )
          delete attrs.src;
        return { tagName: "img", attribs: attrs };
      },
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" &&
      !!frame.attribs.width &&
      !!frame.attribs.height &&
      parseInt(frame.attribs.width) <= 2 &&
      parseInt(frame.attribs.height) <= 2,
  });
}
