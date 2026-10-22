import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("loads Firebase auth and verifies signing keys without require(esm)", () => {
  const script = `
    const assert = require('node:assert/strict');
    const { generateKeyPairSync, sign, verify } = require('node:crypto');
    require('firebase-admin/auth');
    const { retrieveSigningKeys } = require('jwks-rsa/src/utils');
    async function run() {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = publicKey.export({ format: 'jwk' });
      const keys = await retrieveSigningKeys([{ ...jwk, kid: 'runtime-test', use: 'sig', alg: 'RS256' }]);
      assert.equal(keys.length, 1);
      assert.equal(keys[0].kid, 'runtime-test');
      const payload = Buffer.from('runtime smoke test');
      const signature = sign('RSA-SHA256', payload, privateKey);
      assert.ok(verify('RSA-SHA256', payload, keys[0].getPublicKey(), signature));
      console.log('runtime-ok');
    }
    run().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(
    process.execPath,
    ["--no-experimental-require-module", "--input-type=commonjs", "-e", script],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 10000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("runtime-ok");
}, 15000);
