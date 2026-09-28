import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

const SHARED_SECRET = "test-secret-1234567890";

function generateSignature(secret, timestamp, body) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

test("Security Policy: Path Traversal Prevention", async () => {
  const workspaceRoot = path.resolve("./test-workspace");
  await fs.mkdir(workspaceRoot, { recursive: true });

  const safePath = (root, candidate) => {
    const normalized = candidate.replaceAll("\\", "/");
    if (
      !normalized ||
      normalized.startsWith("/") ||
      normalized.startsWith("~") ||
      normalized.includes("..")
    ) {
      throw new Error("Path escapes workspace.");
    }
    const resolved = path.resolve(root, normalized);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error("Path escapes workspace.");
    }
    return resolved;
  };

  assert.throws(() => safePath(workspaceRoot, "../../etc/passwd"), /Path escapes workspace/);
  assert.throws(() => safePath(workspaceRoot, "../secret.txt"), /Path escapes workspace/);
  assert.throws(() => safePath(workspaceRoot, "/etc/shadow"), /Path escapes workspace/);

  const validPath = safePath(workspaceRoot, "subfolder/file.txt");
  assert.equal(validPath, path.join(workspaceRoot, "subfolder", "file.txt"));

  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

test("Security Policy: HMAC Signature Verification", () => {
  const verifySignature = (secret, raw, timestamp, signature) => {
    if (!timestamp || !signature) return false;
    const time = Number(timestamp);
    if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 5 * 60_000) return false;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${raw}`)
      .digest("hex");
    const bufExpected = Buffer.from(expected);
    const bufSignature = Buffer.from(signature);
    if (bufExpected.length !== bufSignature.length) return false;
    return crypto.timingSafeEqual(bufExpected, bufSignature);
  };

  const body = JSON.stringify({ action: { type: "git.status" } });
  const now = Date.now();
  const validSig = generateSignature(SHARED_SECRET, now, body);

  assert.equal(verifySignature(SHARED_SECRET, body, String(now), validSig), true);
  assert.equal(verifySignature(SHARED_SECRET, body, String(now), "invalid-sig-hex-string"), false);
  assert.equal(verifySignature(SHARED_SECRET, body, String(now - 10 * 60_000), validSig), false); // Expired
});

test("Command Policy: Blocked Command Patterns", () => {
  const BLOCKED = [
    /rm\s+-rf\s+(\/|~)/i,
    /mkfs(?:\.|\s)/i,
    /(^|[;&|])\s*dd\s+if=/i,
    /git\s+push\s+--force/i,
    /git\s+reset\s+--hard/i,
    /chmod\s+-R\s+777\s+\//i,
    /:\(\)\s*\{\s*:\|:&\s*\};:/,
    />\s*\/dev\/sd[a-z]/i,
  ];

  const isBlocked = (cmd) => BLOCKED.some((re) => re.test(cmd));

  assert.equal(isBlocked("rm -rf /"), true);
  assert.equal(isBlocked("git push --force origin main"), true);
  assert.equal(isBlocked("npm test"), false);
  assert.equal(isBlocked("git status"), false);
});
