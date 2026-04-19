import { Command } from "commander";
import type {
  CommandError,
  CommandOptions,
  ListResult,
  OutputSchema,
  SingleResult,
} from "../../output/index.js";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { connectToDaemon } from "../../utils/client.js";

type DirectAuthTokenRow = {
  id: string;
  kind: "persistent" | "temporary";
  label: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string;
  lastUsedAt: string;
};

type DirectAuthTokenSecretRow = DirectAuthTokenRow & {
  token: string;
};

interface TokenCommandOptions extends CommandOptions {
  host?: string;
  token?: string;
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
    { header: "REVOKED", field: "revokedAt" },
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
    { header: "REVOKED", field: "revokedAt" },
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
  revokedAt: string | null;
  lastUsedAt: string | null;
}): DirectAuthTokenRow {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label ?? "-",
    createdAt: input.createdAt,
    expiresAt: input.expiresAt ?? "-",
    revokedAt: input.revokedAt ?? "-",
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

async function withDaemonClient<T>(
  options: TokenCommandOptions,
  action: (client: Awaited<ReturnType<typeof connectToDaemon>>) => Promise<T>,
): Promise<T> {
  const client = await connectToDaemon(options);
  try {
    return await action(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function runTokenListCommand(
  options: TokenCommandOptions,
  _command: Command,
): Promise<ListResult<DirectAuthTokenRow>> {
  return withDaemonClient(options, async (client) => {
    const payload = await client.listDirectAuthTokens();
    return {
      type: "list",
      data: payload.tokens.map((token: (typeof payload.tokens)[number]) => toTokenRow(token)),
      schema: tokenListSchema,
    };
  });
}

export async function runTokenCreateCommand(
  options: TokenCreateOptions,
  _command: Command,
): Promise<SingleResult<DirectAuthTokenSecretRow>> {
  return withDaemonClient(options, async (client) => {
    const payload = await client.createDirectAuthToken({
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
  });
}

export async function runTokenRevokeCommand(
  id: string,
  options: TokenCommandOptions,
  _command: Command,
): Promise<SingleResult<DirectAuthTokenRow>> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    throw toCommandError("INVALID_TOKEN_ID", "Token id is required");
  }

  return withDaemonClient(options, async (client) => {
    const payload = await client.revokeDirectAuthToken(normalizedId);
    return {
      type: "single",
      data: toTokenRow(payload.record),
      schema: tokenListSchema,
    };
  });
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

  return withDaemonClient(options, async (client) => {
    const payload = await client.rotateDirectAuthToken(normalizedId);
    return {
      type: "single",
      data: {
        ...toTokenRow(payload.record),
        token: payload.token,
      },
      schema: tokenSecretSchema,
    };
  });
}

export function tokenCommand(): Command {
  const token = new Command("token").description("Manage daemon direct auth tokens");

  addJsonAndDaemonHostOptions(
    token
      .command("create")
      .description("Create a direct auth token")
      .option("--label <label>", "Optional token label")
      .option("--ttl <seconds>", "Optional token TTL in seconds")
      .option("--temporary", "Create a temporary token"),
  ).action(withOutput(runTokenCreateCommand));

  addJsonAndDaemonHostOptions(token.command("ls").description("List direct auth tokens")).action(
    withOutput(runTokenListCommand),
  );

  addJsonAndDaemonHostOptions(
    token.command("revoke").description("Revoke a direct auth token").argument("<id>", "Token id"),
  ).action(withOutput(runTokenRevokeCommand));

  addJsonAndDaemonHostOptions(
    token.command("rotate").description("Rotate a direct auth token").argument("<id>", "Token id"),
  ).action(withOutput(runTokenRotateCommand));

  return token;
}
