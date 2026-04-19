import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { DaemonConfigStore } from "./daemon-config-store.js";

const tempDirs: string[] = [];

function makeTempHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "paseo-daemon-config-store-test-"));
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

describe("DaemonConfigStore direct auth", () => {
  test("persists direct auth patches", () => {
    const paseoHome = makeTempHome();
    mkdirSync(paseoHome, { recursive: true });
    writeFileSync(
      path.join(paseoHome, "config.json"),
      JSON.stringify({
        version: 1,
        daemon: {
          directAuth: {
            mode: "off",
            enforceOnNonLoopback: false,
          },
          mcp: {
            injectIntoAgents: false,
          },
        },
      }),
    );

    const store = new DaemonConfigStore(
      paseoHome,
      {
        directAuth: {
          mode: "off",
          enforceOnNonLoopback: false,
        },
        mcp: {
          injectIntoAgents: false,
        },
      },
      undefined,
    );

    const next = store.patch({
      directAuth: {
        mode: "bearer",
        enforceOnNonLoopback: true,
      },
    });

    expect(next.directAuth).toEqual({
      mode: "bearer",
      enforceOnNonLoopback: true,
    });

    const persisted = JSON.parse(readFileSync(path.join(paseoHome, "config.json"), "utf-8")) as {
      daemon?: {
        directAuth?: {
          mode?: string;
          enforceOnNonLoopback?: boolean;
        };
      };
    };

    expect(persisted.daemon?.directAuth).toEqual({
      mode: "bearer",
      enforceOnNonLoopback: true,
    });
  });
});
