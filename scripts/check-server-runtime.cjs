// Run with the same module restrictions as Lambda, without app credentials.
const assert = require("node:assert/strict");
const path = require("node:path");
const sanitize = require("sanitize-html");
require("firebase-admin/auth");

assert.equal(sanitize("<p>Reply received</p><script>alert(1)</script>"), "<p>Reply received</p>");
assert.equal(sanitize('<a href="javascript:alert(1)" onclick="steal()">Open</a>'), "<a>Open</a>");
for (const tag of ["textarea", "xmp"]) {
  const output = sanitize(`<${tag}><img src=x onerror=alert(1)></${tag}>`, {
    allowedTags: [tag, "img"],
    allowedAttributes: { img: ["src"] },
    allowVulnerableTags: true,
  });
  assert.ok(!output.includes("<img"), `${tag} must not turn raw text into active markup`);
}
// Exercise the worker's whole import graph, not just the dependency that failed.
// Keep packages external as they are in the deployed function.
const workerFile = path.resolve(__dirname, "../.netlify/runtime-check/sync-mail-background.cjs");
require("esbuild").buildSync({
  entryPoints: [path.resolve(__dirname, "../netlify/functions/sync-mail-background.ts")],
  outfile: workerFile,
  bundle: true,
  packages: "external",
  platform: "node",
  format: "cjs",
  target: "node22",
});
const worker = require(workerFile);
assert.equal(typeof worker.default, "function");
// No authorization: verify the entry point without accessing live accounts.
worker.default(new Request("https://example.com/worker")).then(() => {
  console.log(
    "Background worker cold start and HTML sanitization pass with Lambda module restrictions enabled.",
  );
});
