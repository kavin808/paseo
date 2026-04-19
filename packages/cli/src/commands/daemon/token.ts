import { Command } from "commander";
import type {
  CommandError,
  CommandOptions,
  ListResult,
  OutputSchema,
  SingleResult,
} from "../../output/index.js";
import { withOutput } from "../../output/index.js";
import { addJsonOption } from "../../utils/command-options.js";
import { DirectAuthService } from "../../../../server/src/server/direct-auth/direct-auth-service.ts";
import { resolvePaseoHome } from "../../../../server/src/server/paseo-home.ts";

type DirectAuthTokenRow = {
  id: string;
  kind: "persistent" | "temporary";
  label: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
};

type DirectAuthTokenSecretRow = DirectAuthTokenRow & {
  token: string;
};

interface TokenCommandOptions extends CommandOptions {
  home?: string;
}

interface TokenCreateOptions extends TokenCommandOptions {
  label?: string;
  ttl?: string;
  temporary?: boolean;
}

const tokenListSchema: OutputSchema<DirectAuthTokenRow> = {
  idField: "id",
  columns: [
    { header: "ID", field: "id" },
    { header: "KIND", field: "kind" },
    { header: "LABEL", field: "label" },
    { header: "CREATED", field: "createdAt" },
    { header: "EXPIRES", field: "expiresAt" },
    { header: "LAST USED", field: "lastUsedAt" },
  ],
};

const tokenSecretSchema: OutputSchema<DirectAuthTokenSecretRow> = {
  idField: "id",
  columns: [
    { header: "ID", field: "id" },
    { header: "TOKEN", field: "token" },
    { header: "KIND", field: "kind" },
    { header: "LABEL", field: "label" },
    { header: "CREATED", field: "createdAt" },
    { header: "EXPIRES", field: "expiresAt" },
    { header: "LAST USED", field: "lastUsedAt" },
  ],
};

function toCommandError(code: string, message: string, details?: unknown): CommandError {
  return { code, message, details };
}

function toTokenRow(input: {
  id: string;
  kind: "persistent" | "temporary";
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}): DirectAuthTokenRow {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label ?? "-",
    createdAt: input.createdAt,
    expiresAt: input.expiresAt ?? "-",
    lastUsedAt: input.lastUsedAt ?? "-",
  };
}

function parseTtlMs(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw toCommandError(
      "INVALID_TTL",
      `Invalid TTL value: ${String(raw)}`,
      "TTL must be a positive number of seconds",
    );
  }

  return Math.ceil(seconds * 1000);
}

function resolveTokenService(options: TokenCommandOptions): DirectAuthService {
  const env =
    typeof options.home === "string" ? { ...process.env, PASEO_HOME: options.home } : process.env;
  const paseoHome = resolvePaseoHome(env);
  return new DirectAuthService({ paseoHome });
}

export async function runTokenListCommand(
  options: TokenCommandOptions,
  _command: Command,
): Promise<ListResult<DirectAuthTokenRow>> {
  const service = resolveTokenService(options);
  return {
    type: "list",
    data: service.listTokens().map((token) => toTokenRow(token)),
    schema: tokenListSchema,
  };
}

export async function runTokenCreateCommand(
  options: TokenCreateOptions,
  _command: Command,
): Promise<SingleResult<DirectAuthTokenSecretRow>> {
  const service = resolveTokenService(options);
  const payload = service.issueToken({
    kind: options.temporary ? "temporary" : "persistent",
    label: typeof options.label === "string" ? options.label : undefined,
    ttlMs: parseTtlMs(options.ttl),
  });

  return {
    type: "single",
    data: {
      ...toTokenRow(payload.record),
      token: payload.token,
    },
    schema: tokenSecretSchema,
  };
}

export async function runTokenDeleteCommand(
  id: string,
  options: TokenCommandOptions,
  _command: Command,
): Promise<SingleResult<DirectAuthTokenRow>> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    throw toCommandError("INVALID_TOKEN_ID", "Token id is required");
  }

  const service = resolveTokenService(options);
  const record = service.deleteToken(normalizedId);
  if (!record) {
    throw toCommandError("TOKEN_NOT_FOUND", `Direct auth token not found: ${normalizedId}`);
  }

  return {
    type: "single",
    data: toTokenRow(record),
    schema: tokenListSchema,
  };
}

export async function runTokenRotateCommand(
  id: string,
  options: TokenCommandOptions,
  _command: Command,
): Promise<SingleResult<DirectAuthTokenSecretRow>> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    throw toCommandError("INVALID_TOKEN_ID", "Token id is required");
  }

  const service = resolveTokenService(options);
  const payload = service.rotateToken(normalizedId);
  if (!payload) {
    throw toCommandError("TOKEN_NOT_FOUND", `Direct auth token not found: ${normalizedId}`);
  }

  return {
    type: "single",
    data: {
      ...toTokenRow(payload.record),
      token: payload.token,
    },
    schema: tokenSecretSchema,
  };
}

export function tokenCommand(): Command {
  const token = new Command("token").description("Manage daemon direct auth tokens");

  addJsonOption(
    token
      .command("create")
      .description("Create a direct auth token")
      .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
      .option("--label <label>", "Optional token label")
      .option("--ttl <seconds>", "Optional token TTL in seconds")
      .option("--temporary", "Create a temporary token"),
  ).action(withOutput(runTokenCreateCommand));

  addJsonOption(
    token
      .command("ls")
      .description("List direct auth tokens")
      .option("--home <path>", "Paseo home directory (default: ~/.paseo)"),
  ).action(withOutput(runTokenListCommand));

  addJsonOption(
    token
      .command("delete")
      .description("Delete a direct auth token")
      .argument("<id>", "Token id")
      .option("--home <path>", "Paseo home directory (default: ~/.paseo)"),
  ).action(withOutput(runTokenDeleteCommand));

  addJsonOption(
    token
      .command("rotate")
      .description("Rotate a direct auth token")
      .argument("<id>", "Token id")
      .option("--home <path>", "Paseo home directory (default: ~/.paseo)"),
  ).action(withOutput(runTokenRotateCommand));

  return token;
}
