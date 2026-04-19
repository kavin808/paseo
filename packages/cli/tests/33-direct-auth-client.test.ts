#!/usr/bin/env npx tsx

import assert from "node:assert";
import { resolveDirectToken } from "../src/utils/client.ts";

console.log("=== Direct Auth CLI Helpers ===\n");

{
  console.log("Test 1: prefers explicit token option");
  process.env.PASEO_DIRECT_TOKEN = "env-token";
  const originalArgv = process.argv;
  process.argv = ["node", "paseo", "ls", "--token", "argv-token"];
  try {
    assert.strictEqual(resolveDirectToken({ token: "option-token" }), "option-token");
  } finally {
    process.argv = originalArgv;
    delete process.env.PASEO_DIRECT_TOKEN;
  }
  console.log("✓ prefers explicit token option\n");
}

{
  console.log("Test 2: falls back to PASEO_DIRECT_TOKEN");
  process.env.PASEO_DIRECT_TOKEN = "env-token";
  const originalArgv = process.argv;
  process.argv = ["node", "paseo", "ls"];
  try {
    assert.strictEqual(resolveDirectToken({}), "env-token");
  } finally {
    process.argv = originalArgv;
    delete process.env.PASEO_DIRECT_TOKEN;
  }
  console.log("✓ falls back to PASEO_DIRECT_TOKEN\n");
}

{
  console.log("Test 3: falls back to --token argv parsing");
  const originalArgv = process.argv;
  process.argv = ["node", "paseo", "ls", "--token", "argv-token"];
  try {
    assert.strictEqual(resolveDirectToken({}), "argv-token");
  } finally {
    process.argv = originalArgv;
  }
  console.log("✓ falls back to --token argv parsing\n");
}

{
  console.log("Test 4: supports --token=value argv syntax");
  const originalArgv = process.argv;
  process.argv = ["node", "paseo", "ls", "--token=argv-inline-token"];
  try {
    assert.strictEqual(resolveDirectToken({}), "argv-inline-token");
  } finally {
    process.argv = originalArgv;
  }
  console.log("✓ supports --token=value argv syntax\n");
}

console.log("=== All direct auth CLI helper tests passed ===");
