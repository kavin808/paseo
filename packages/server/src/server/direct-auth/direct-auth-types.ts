export type DirectAuthTokenKind = "persistent" | "temporary";

export interface DirectAuthTokenRecord {
  id: string;
  kind: DirectAuthTokenKind;
  label: string | null;
  tokenHash: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export type DirectAuthAuthenticateResult =
  | { ok: true; record: DirectAuthTokenRecord }
  | { ok: false; reason: "invalid" | "expired" };

export interface IssueDirectAuthTokenInput {
  kind?: DirectAuthTokenKind;
  label?: string | null;
  ttlMs?: number | null;
}

export interface IssueDirectAuthTokenResult {
  token: string;
  record: DirectAuthTokenRecord;
}

export interface RotateDirectAuthTokenResult {
  token: string;
  record: DirectAuthTokenRecord;
}
