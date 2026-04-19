import { createHash, randomBytes, randomUUID } from "node:crypto";
import pino from "pino";

import { DirectAuthStore } from "./direct-auth-store.js";
import type {
  DirectAuthAuthenticateResult,
  DirectAuthTokenKind,
  DirectAuthTokenRecord,
  IssueDirectAuthTokenInput,
  IssueDirectAuthTokenResult,
  RotateDirectAuthTokenResult,
} from "./direct-auth-types.js";

type DirectAuthServiceOptions = {
  logger?: pino.Logger;
  paseoHome: string;
  now?: () => Date;
  randomTokenBytes?: (size: number) => Buffer;
};

function normalizeLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function computeTokenHash(salt: string, token: string): string {
  return createHash("sha256").update(`${salt}${token}`, "utf8").digest("hex");
}

function isExpired(record: DirectAuthTokenRecord, now: Date): boolean {
  return record.expiresAt !== null && Date.parse(record.expiresAt) <= now.getTime();
}

export class DirectAuthService {
  private readonly logger: pino.Logger;
  private readonly store: DirectAuthStore;
  private readonly now: () => Date;
  private readonly randomTokenBytes: (size: number) => Buffer;

  constructor(options: DirectAuthServiceOptions) {
    this.logger =
      options.logger?.child({ component: "direct-auth-service" }) ?? pino({ enabled: false });
    this.store = new DirectAuthStore(this.logger, options.paseoHome);
    this.now = options.now ?? (() => new Date());
    this.randomTokenBytes = options.randomTokenBytes ?? randomBytes;
  }

  issueToken(input: IssueDirectAuthTokenInput = {}): IssueDirectAuthTokenResult {
    const kind: DirectAuthTokenKind = input.kind ?? "persistent";
    const now = this.now();
    const token = `paseo_dt_${this.randomTokenBytes(32).toString("base64url")}`;
    const salt = this.store.loadOrCreateSalt();
    const record: DirectAuthTokenRecord = {
      id: randomUUID(),
      kind,
      label: normalizeLabel(input.label),
      tokenHash: computeTokenHash(salt, token),
      createdAt: now.toISOString(),
      expiresAt:
        typeof input.ttlMs === "number" && input.ttlMs > 0
          ? new Date(now.getTime() + input.ttlMs).toISOString()
          : null,
      lastUsedAt: null,
    };
    const tokens = this.store.loadTokens();
    tokens.push(record);
    this.store.saveTokens(tokens);
    this.logger.info({ tokenId: record.id, kind }, "Issued direct auth token");
    return { token, record };
  }

  listTokens(): DirectAuthTokenRecord[] {
    return this.store.loadTokens();
  }

  authenticateToken(token: string): DirectAuthAuthenticateResult {
    const normalizedToken = token.trim();
    if (normalizedToken.length === 0) {
      return { ok: false, reason: "invalid" };
    }

    const salt = this.store.loadOrCreateSalt();
    const tokenHash = computeTokenHash(salt, normalizedToken);
    const now = this.now();
    const tokens = this.store.loadTokens();
    const match = tokens.find((record) => record.tokenHash === tokenHash);
    if (!match) {
      return { ok: false, reason: "invalid" };
    }
    if (isExpired(match, now)) {
      return { ok: false, reason: "expired" };
    }

    const updatedRecord = {
      ...match,
      lastUsedAt: now.toISOString(),
    };
    this.store.saveTokens(
      tokens.map((record) => (record.id === match.id ? updatedRecord : record)),
    );
    return { ok: true, record: updatedRecord };
  }

  deleteToken(id: string): DirectAuthTokenRecord | null {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) {
      return null;
    }

    const tokens = this.store.loadTokens();
    const deleted = tokens.find((record) => record.id === normalizedId) ?? null;
    if (!deleted) {
      return null;
    }
    this.store.saveTokens(tokens.filter((record) => record.id !== normalizedId));
    return deleted;
  }

  rotateToken(id: string): RotateDirectAuthTokenResult | null {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) {
      return null;
    }

    const now = this.now();
    const salt = this.store.loadOrCreateSalt();
    const token = `paseo_dt_${this.randomTokenBytes(32).toString("base64url")}`;
    let rotated: DirectAuthTokenRecord | null = null;
    const next = this.store.loadTokens().map((record) => {
      if (record.id !== normalizedId) {
        return record;
      }
      rotated = {
        ...record,
        tokenHash: computeTokenHash(salt, token),
        createdAt: now.toISOString(),
        expiresAt: record.expiresAt,
        lastUsedAt: null,
      };
      return rotated;
    });

    if (!rotated) {
      return null;
    }
    this.store.saveTokens(next);
    return { token, record: rotated };
  }

  pruneExpired(): number {
    const now = this.now();
    const tokens = this.store.loadTokens();
    const next = tokens.filter((record) => !isExpired(record, now));
    if (next.length === tokens.length) {
      return 0;
    }
    this.store.saveTokens(next);
    return tokens.length - next.length;
  }
}
