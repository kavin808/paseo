import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "./config.js";

const tempDirs: string[] = [];

function makeTempHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "paseo-config-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for tmp test dirs.
    }
  }
});

describe("loadConfig direct auth", () => {
  test("defaults direct auth to off", () => {
    const paseoHome = makeTempHome();

    const config = loadConfig(paseoHome, { env: {} as NodeJS.ProcessEnv });

    expect(config.directAuth).toEqual({
      mode: "off",
      enforceOnNonLoopback: false,
    });
  });

  test("loads persisted direct auth settings", () => {
    const paseoHome = makeTempHome();
    mkdirSync(paseoHome, { recursive: true });
    writeFileSync(
      path.join(paseoHome, "config.json"),
      JSON.stringify({
        version: 1,
        daemon: {
          directAuth: {
            mode: "bearer",
            enforceOnNonLoopback: true,
          },
        },
      }),
    );

    const config = loadConfig(paseoHome, { env: {} as NodeJS.ProcessEnv });

    expect(config.directAuth).toEqual({
      mode: "bearer",
      enforceOnNonLoopback: true,
    });
  });
});
