#!/usr/bin/env npx tsx

import assert from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "zx";
import { getAvailablePort } from "./helpers/network.ts";

$.verbose = false;

const TEST_ENV_DEFAULTS = {
  PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD: process.env.PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD ?? "0",
  PASEO_DICTATION_ENABLED: process.env.PASEO_DICTATION_ENABLED ?? "0",
  PASEO_VOICE_MODE_ENABLED: process.env.PASEO_VOICE_MODE_ENABLED ?? "0",
};

function killPidTree(pid: number, signal: NodeJS.Signals): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        return;
      }
    }
  }

  try {
    process.kill(pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") {
      throw error;
    }
  }
}

function createCliEnv(paseoHome: string, port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PASEO_HOME: paseoHome,
    PASEO_HOST: `localhost:${port}`,
    PASEO_LISTEN: `127.0.0.1:${port}`,
    PASEO_RELAY_ENABLED: "false",
    PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD: TEST_ENV_DEFAULTS.PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD,
    PASEO_DICTATION_ENABLED: TEST_ENV_DEFAULTS.PASEO_DICTATION_ENABLED,
    PASEO_VOICE_MODE_ENABLED: TEST_ENV_DEFAULTS.PASEO_VOICE_MODE_ENABLED,
    CI: "true",
  };
}

async function waitForDaemon(paseoHome: string, port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result =
      await $`PASEO_HOME=${paseoHome} PASEO_HOST=localhost:${port} PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD=${TEST_ENV_DEFAULTS.PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD} PASEO_DICTATION_ENABLED=${TEST_ENV_DEFAULTS.PASEO_DICTATION_ENABLED} PASEO_VOICE_MODE_ENABLED=${TEST_ENV_DEFAULTS.PASEO_VOICE_MODE_ENABLED} node --import tsx packages/cli/src/index.ts daemon token ls --json`.nothrow();
    if (result.exitCode === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Daemon failed to start on port ${port} within ${timeoutMs}ms`);
}

console.log("=== Daemon Token Commands ===\n");

const port = await getAvailablePort();
const paseoHome = await mkdtemp(join(tmpdir(), "paseo-token-home-"));
let daemon: ChildProcess | null = null;

try {
  daemon = spawn(
    "node",
    ["--import", "tsx", "packages/cli/src/index.ts", "daemon", "start", "--foreground"],
    {
      cwd: process.cwd(),
      env: createCliEnv(paseoHome, port),
      detached: process.platform !== "win32",
      stdio: "ignore",
    },
  );
  daemon.unref();
  await waitForDaemon(paseoHome, port);

  const runCli = async (args: string[]) =>
    $`PASEO_HOME=${paseoHome} PASEO_HOST=localhost:${port} PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD=${TEST_ENV_DEFAULTS.PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD} PASEO_DICTATION_ENABLED=${TEST_ENV_DEFAULTS.PASEO_DICTATION_ENABLED} PASEO_VOICE_MODE_ENABLED=${TEST_ENV_DEFAULTS.PASEO_VOICE_MODE_ENABLED} node --import tsx packages/cli/src/index.ts ${args}`.nothrow();

  console.log("Test 1: create emits token and metadata");
  const create = await runCli([
    "daemon",
    "token",
    "create",
    "--label",
    "phone",
    "--temporary",
    "--ttl",
    "60",
    "--json",
  ]);

  assert.strictEqual(create.exitCode, 0, `create failed:\n${create.stderr}\n${create.stdout}`);
  const created = JSON.parse(create.stdout) as {
    id: string;
    token: string;
    kind: "persistent" | "temporary";
    label: string;
    expiresAt: string;
  };
  assert(created.id.length > 0, "create should return an id");
  assert(created.token.startsWith("paseo_dt_"), "create should return a direct auth token");
  assert.strictEqual(created.kind, "temporary");
  assert.strictEqual(created.label, "phone");
  assert.notStrictEqual(created.expiresAt, "-", "temporary token should include expiresAt");
  console.log("✓ create emits token and metadata\n");

  console.log("Test 2: ls includes created token metadata");
  const list = await runCli(["daemon", "token", "ls", "--json"]);
  assert.strictEqual(list.exitCode, 0, `ls failed:\n${list.stderr}\n${list.stdout}`);
  const listed = JSON.parse(list.stdout) as Array<{
    id: string;
    label: string;
    kind: "persistent" | "temporary";
  }>;
  const listedCreated = listed.find((entry) => entry.id === created.id);
  assert(listedCreated, "ls should include created token");
  assert.strictEqual(listedCreated?.label, "phone");
  assert.strictEqual(listedCreated?.kind, "temporary");
  console.log("✓ ls includes created token metadata\n");

  console.log("Test 3: rotate keeps id and returns a new token");
  const rotate = await runCli(["daemon", "token", "rotate", created.id, "--json"]);
  assert.strictEqual(rotate.exitCode, 0, `rotate failed:\n${rotate.stderr}\n${rotate.stdout}`);
  const rotated = JSON.parse(rotate.stdout) as {
    id: string;
    token: string;
    revokedAt: string;
  };
  assert.strictEqual(rotated.id, created.id, "rotate should preserve token id");
  assert(rotated.token.startsWith("paseo_dt_"), "rotate should return a replacement token");
  assert.notStrictEqual(rotated.token, created.token, "rotate should issue a new token");
  assert.strictEqual(rotated.revokedAt, "-", "rotated token should remain active");
  console.log("✓ rotate keeps id and returns a new token\n");

  console.log("Test 4: revoke marks token revoked");
  const revoke = await runCli(["daemon", "token", "revoke", created.id, "--json"]);
  assert.strictEqual(revoke.exitCode, 0, `revoke failed:\n${revoke.stderr}\n${revoke.stdout}`);
  const revoked = JSON.parse(revoke.stdout) as {
    id: string;
    revokedAt: string;
  };
  assert.strictEqual(revoked.id, created.id, "revoke should target the same token id");
  assert.notStrictEqual(revoked.revokedAt, "-", "revoke should set revokedAt");
  console.log("✓ revoke marks token revoked\n");
} finally {
  if (daemon?.pid) {
    killPidTree(daemon.pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 250));
    killPidTree(daemon.pid, "SIGKILL");
  }
  await rm(paseoHome, { recursive: true, force: true });
}

console.log("=== Daemon token command tests passed ===");
