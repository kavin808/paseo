#!/usr/bin/env npx tsx

import assert from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  runTokenCreateCommand,
  runTokenDeleteCommand,
  runTokenListCommand,
  runTokenRotateCommand,
} from "../src/commands/daemon/token.ts";

console.log("=== Daemon Token Commands ===\n");

const paseoHome = await mkdtemp(join(tmpdir(), "paseo-token-home-"));
const command = new Command("token-test");

try {
  console.log("Test 1: create emits token and metadata");
  const create = await runTokenCreateCommand(
    {
      json: true,
      home: paseoHome,
      label: "phone",
      temporary: true,
      ttl: "60",
    },
    command,
  );
  assert.strictEqual(create.type, "single");
  const created = create.data;
  assert(created.id.length > 0, "create should return an id");
  assert(created.token.startsWith("paseo_dt_"), "create should return a direct auth token");
  assert.strictEqual(created.kind, "temporary");
  assert.strictEqual(created.label, "phone");
  assert.notStrictEqual(created.expiresAt, "-", "temporary token should include expiresAt");
  console.log("✓ create emits token and metadata\n");

  console.log("Test 2: ls includes created token metadata");
  const list = await runTokenListCommand({ json: true, home: paseoHome }, command);
  assert.strictEqual(list.type, "list");
  const listedCreated = list.data.find((entry) => entry.id === created.id);
  assert(listedCreated, "ls should include created token");
  assert.strictEqual(listedCreated?.label, "phone");
  assert.strictEqual(listedCreated?.kind, "temporary");
  console.log("✓ ls includes created token metadata\n");

  console.log("Test 3: rotate keeps id and returns a new token");
  const rotate = await runTokenRotateCommand(created.id, { json: true, home: paseoHome }, command);
  assert.strictEqual(rotate.type, "single");
  const rotated = rotate.data;
  assert.strictEqual(rotated.id, created.id, "rotate should preserve token id");
  assert(rotated.token.startsWith("paseo_dt_"), "rotate should return a replacement token");
  assert.notStrictEqual(rotated.token, created.token, "rotate should issue a new token");
  console.log("✓ rotate keeps id and returns a new token\n");

  console.log("Test 4: delete removes token from local store");
  const deleted = await runTokenDeleteCommand(created.id, { json: true, home: paseoHome }, command);
  assert.strictEqual(deleted.type, "single");
  assert.strictEqual(deleted.data.id, created.id, "delete should target the same token id");
  const listAfterDelete = await runTokenListCommand({ json: true, home: paseoHome }, command);
  assert.strictEqual(listAfterDelete.type, "list");
  assert.strictEqual(
    listAfterDelete.data.some((entry) => entry.id === created.id),
    false,
    "deleted token should disappear from ls",
  );
  console.log("✓ delete removes token from local store\n");
} finally {
  await rm(paseoHome, { recursive: true, force: true });
}

console.log("=== Daemon token command tests passed ===");
