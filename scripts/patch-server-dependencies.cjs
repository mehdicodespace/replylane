// jwks-rsa 4.1.0 eagerly requires ESM-only jose. Lambda disables require(esm).
// Keep the dependency versions and signing logic; defer jose via import().
const fs = require("node:fs");
const path = require("node:path");

const root = path.dirname(require.resolve("jwks-rsa/package.json"));
const { version } = require(path.join(root, "package.json"));
if (version !== "4.1.0") {
  throw new Error(`Review the jwks-rsa runtime patch for version ${version}`);
}

const patches = [
  [
    "src/utils.js",
    [
      ["const jose = require('jose');\n", ""],
      [
        "async function retrieveSigningKeys(jwks) {\n",
        "async function retrieveSigningKeys(jwks) {\n  const jose = await import('jose');\n",
      ],
    ],
  ],
  [
    "src/integrations/passport.js",
    [
      ["const jose = require('jose');\n", ""],
      [
        "return function secretProvider(req, rawJwtToken, cb) {",
        "return async function secretProvider(req, rawJwtToken, cb) {",
      ],
      ["    try {\n", "    try {\n      const jose = await import('jose');\n"],
    ],
  ],
];

for (const [relativePath, replacements] of patches) {
  const filename = path.join(root, relativePath);
  let source = fs.readFileSync(filename, "utf8").replace(/\r\n/g, "\n");
  // A cached install may already contain the complete patch.
  if (!source.includes("const jose = require('jose');")) {
    if (!replacements.filter(([, after]) => after).every(([, after]) => source.includes(after))) {
      throw new Error(`Unexpected jwks-rsa source in ${relativePath}`);
    }
    continue;
  }
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) {
      throw new Error(`Cannot safely patch jwks-rsa ${relativePath}`);
    }
    source = source.replace(before, after);
  }
  fs.writeFileSync(filename, source);
}
console.log("Applied jwks-rsa Lambda compatibility patch");
