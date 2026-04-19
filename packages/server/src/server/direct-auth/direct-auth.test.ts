import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { DirectAuthService } from "./direct-auth-service.js";

const tempDirs: string[] = [];

function makeTempHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "paseo-direct-auth-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("DirectAuthService", () => {
  test("issues and authenticates a persistent token", () => {
    let now = new Date("2026-04-19T00:00:00.000Z");
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
      now: () => now,
    });

    const issued = service.issueToken({ label: "My Laptop" });
    expect(issued.token.startsWith("paseo_dt_")).toBe(true);
    expect(issued.record.kind).toBe("persistent");
    expect(issued.record.label).toBe("My Laptop");
    expect(issued.record.tokenHash).not.toContain(issued.token);

    now = new Date("2026-04-19T00:05:00.000Z");
    const result = service.authenticateToken(issued.token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.lastUsedAt).toBe("2026-04-19T00:05:00.000Z");
    }
  });

  test("rejects expired tokens", () => {
    let now = new Date("2026-04-19T00:00:00.000Z");
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
      now: () => now,
    });

    const issued = service.issueToken({ kind: "temporary", ttlMs: 60_000 });
    now = new Date("2026-04-19T00:02:00.000Z");

    expect(service.authenticateToken(issued.token)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  test("rejects revoked tokens", () => {
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
      now: () => new Date("2026-04-19T00:00:00.000Z"),
    });

    const issued = service.issueToken();
    const revoked = service.revokeToken(issued.record.id);
    expect(revoked?.revokedAt).toBe("2026-04-19T00:00:00.000Z");

    expect(service.authenticateToken(issued.token)).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  test("rotateToken invalidates the old token and issues a new one", () => {
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
      now: () => new Date("2026-04-19T00:00:00.000Z"),
    });

    const issued = service.issueToken({ label: "Desktop" });
    const rotated = service.rotateToken(issued.record.id);

    expect(rotated).not.toBeNull();
    expect(rotated?.record.id).toBe(issued.record.id);
    expect(rotated?.record.label).toBe("Desktop");
    expect(rotated?.token).not.toBe(issued.token);
    expect(service.authenticateToken(issued.token)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(service.authenticateToken(rotated!.token).ok).toBe(true);
  });

  test("pruneExpired removes expired tokens from the store", () => {
    let now = new Date("2026-04-19T00:00:00.000Z");
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
      now: () => now,
    });

    service.issueToken({ kind: "temporary", ttlMs: 1_000 });
    service.issueToken({ kind: "persistent" });
    now = new Date("2026-04-19T00:00:05.000Z");

    expect(service.pruneExpired()).toBe(1);
    expect(service.listTokens()).toHaveLength(1);
    expect(service.listTokens()[0]?.kind).toBe("persistent");
  });
});
