import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type pino from "pino";

import type { DirectAuthTokenRecord } from "./direct-auth-types.js";

const DirectAuthTokenRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["persistent", "temporary"]),
  label: z.string().nullable(),
  tokenHash: z.string().min(1),
  createdAt: z.string().min(1),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
});

const DirectAuthTokensFileSchema = z.object({
  tokens: z.array(DirectAuthTokenRecordSchema),
});

function writeFileAtomic(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, contents);
  renameSync(tmpPath, filePath);
}

export class DirectAuthStore {
  private readonly logger: pino.Logger;
  private readonly baseDir: string;
  private readonly saltPath: string;
  private readonly tokensPath: string;

  constructor(logger: pino.Logger, paseoHome: string) {
    this.logger = logger.child({ component: "direct-auth-store" });
    this.baseDir = path.join(paseoHome, "direct-auth");
    this.saltPath = path.join(this.baseDir, "salt");
    this.tokensPath = path.join(this.baseDir, "tokens.json");
  }

  loadOrCreateSalt(): string {
    mkdirSync(this.baseDir, { recursive: true });

    if (existsSync(this.saltPath)) {
      const salt = readFileSync(this.saltPath, "utf-8").trim();
      if (salt.length > 0) {
        return salt;
      }
    }

    const salt = randomBytes(32).toString("base64url");
    writeFileAtomic(this.saltPath, `${salt}\n`);
    return salt;
  }

  loadTokens(): DirectAuthTokenRecord[] {
    if (!existsSync(this.tokensPath)) {
      return [];
    }

    const raw = readFileSync(this.tokensPath, "utf-8");
    const parsed = DirectAuthTokensFileSchema.parse(JSON.parse(raw));
    return parsed.tokens;
  }

  saveTokens(tokens: DirectAuthTokenRecord[]): void {
    const payload = DirectAuthTokensFileSchema.parse({ tokens });
    writeFileAtomic(this.tokensPath, `${JSON.stringify(payload, null, 2)}\n`);
    this.logger.debug({ total: tokens.length }, "Persisted direct auth tokens");
  }
}
