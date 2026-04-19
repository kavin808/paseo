import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionOutboundMessage } from "../shared/messages.js";
import { Session } from "./session.js";
import { DirectAuthService } from "./direct-auth/direct-auth-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createSessionForDirectAuthTests() {
  const onMessage = vi.fn<(msg: SessionOutboundMessage) => void>();
  const logger = {
    child: () => logger,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-direct-auth-session-"));
  tempDirs.push(paseoHome);
  const directAuthService = new DirectAuthService({
    logger: logger as any,
    paseoHome,
  });

  const session = new Session({
    clientId: "test-client",
    appVersion: null,
    onMessage,
    logger: logger as any,
    downloadTokenStore: {} as any,
    pushTokenStore: {} as any,
    paseoHome,
    agentManager: {
      subscribe: () => () => {},
      listAgents: () => [],
      getAgent: () => null,
      archiveAgent: async () => ({ archivedAt: new Date().toISOString() }),
      archiveSnapshot: async () => ({}),
      clearAgentAttention: async () => {},
      notifyAgentState: () => {},
    } as any,
    agentStorage: {
      list: async () => [],
      get: async () => null,
    } as any,
    projectRegistry: {
      initialize: async () => {},
      existsOnDisk: async () => true,
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      archive: async () => {},
      remove: async () => {},
    } as any,
    workspaceRegistry: {
      initialize: async () => {},
      existsOnDisk: async () => true,
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      archive: async () => {},
      remove: async () => {},
    } as any,
    chatService: {} as any,
    scheduleService: {} as any,
    loopService: {} as any,
    checkoutDiffManager: {
      subscribe: async () => ({
        initial: { cwd: "/tmp", files: [], error: null },
        unsubscribe: () => {},
      }),
      scheduleRefreshForCwd: () => {},
      getMetrics: () => ({
        checkoutDiffTargetCount: 0,
        checkoutDiffSubscriptionCount: 0,
        checkoutDiffWatcherCount: 0,
        checkoutDiffFallbackRefreshTargetCount: 0,
      }),
      dispose: () => {},
    } as any,
    workspaceGitService: {
      subscribe: async (params: { cwd: string }) => ({
        initial: {
          cwd: params.cwd,
          git: {
            isGit: false,
            repoRoot: null,
            mainRepoRoot: null,
            currentBranch: null,
            remoteUrl: null,
            isPaseoOwnedWorktree: false,
            isDirty: null,
            aheadBehind: null,
            aheadOfOrigin: null,
            behindOfOrigin: null,
            diffStat: null,
          },
          github: {
            featuresEnabled: false,
            pullRequest: null,
            error: null,
            refreshedAt: null,
          },
        },
        unsubscribe: () => {},
      }),
      peekSnapshot: () => null,
      getSnapshot: async (cwd: string) => ({
        cwd,
        git: {
          isGit: false,
          repoRoot: null,
          mainRepoRoot: null,
          currentBranch: null,
          remoteUrl: null,
          isPaseoOwnedWorktree: false,
          isDirty: null,
          aheadBehind: null,
          aheadOfOrigin: null,
          behindOfOrigin: null,
          diffStat: null,
        },
        github: {
          featuresEnabled: false,
          pullRequest: null,
          error: null,
          refreshedAt: null,
        },
      }),
      refresh: async () => {},
      requestWorkingTreeWatch: async (cwd: string) => ({
        repoRoot: cwd,
        unsubscribe: () => {},
      }),
      scheduleRefreshForCwd: () => {},
      dispose: () => {},
    } as any,
    daemonConfigStore: {
      get: () => ({
        directAuth: {
          mode: "off",
          enforceOnNonLoopback: false,
        },
        mcp: {
          injectIntoAgents: false,
        },
      }),
      patch: vi.fn(),
      onChange: () => () => {},
      onFieldChange: () => () => {},
    } as any,
    directAuthService,
    mcpBaseUrl: null,
    stt: null,
    tts: null,
    terminalManager: null,
  });

  return { session, onMessage, directAuthService };
}

describe("Session direct auth token management", () => {
  it("creates and lists direct auth tokens without exposing token hashes", async () => {
    const { session, onMessage } = createSessionForDirectAuthTests();

    await session.handleMessage({
      type: "create_direct_auth_token_request",
      requestId: "req_create",
      kind: "temporary",
      label: "phone",
      ttlMs: 60_000,
    });

    const createMessage = onMessage.mock.calls[0]?.[0];
    expect(createMessage?.type).toBe("create_direct_auth_token_response");
    expect(createMessage?.payload.token).toContain("paseo_dt_");
    expect(createMessage?.payload.record.label).toBe("phone");
    expect(createMessage?.payload.record.kind).toBe("temporary");
    expect(createMessage?.payload.record).not.toHaveProperty("tokenHash");

    await session.handleMessage({
      type: "list_direct_auth_tokens_request",
      requestId: "req_list",
    });

    const listMessage = onMessage.mock.calls[1]?.[0];
    expect(listMessage?.type).toBe("list_direct_auth_tokens_response");
    expect(listMessage?.payload.tokens).toHaveLength(1);
    expect(listMessage?.payload.tokens[0]).toMatchObject({
      id: createMessage?.payload.record.id,
      label: "phone",
      kind: "temporary",
    });
    expect(listMessage?.payload.tokens[0]).not.toHaveProperty("tokenHash");
  });

  it("deletes and rotates tokens through session messages", async () => {
    const { session, directAuthService, onMessage } = createSessionForDirectAuthTests();
    const issued = directAuthService.issueToken({ label: "cli" });

    await session.handleMessage({
      type: "rotate_direct_auth_token_request",
      requestId: "req_rotate",
      id: issued.record.id,
    });

    const rotateMessage = onMessage.mock.calls[0]?.[0];
    expect(rotateMessage?.type).toBe("rotate_direct_auth_token_response");
    expect(rotateMessage?.payload.record.id).toBe(issued.record.id);
    expect(rotateMessage?.payload.token).not.toBe(issued.token);
    expect(directAuthService.authenticateToken(issued.token)).toEqual({
      ok: false,
      reason: "invalid",
    });

    await session.handleMessage({
      type: "delete_direct_auth_token_request",
      requestId: "req_delete",
      id: issued.record.id,
    });

    const deleteMessage = onMessage.mock.calls[1]?.[0];
    expect(deleteMessage?.type).toBe("delete_direct_auth_token_response");
    expect(deleteMessage?.payload.record.id).toBe(issued.record.id);
    expect(directAuthService.authenticateToken(rotateMessage.payload.token)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("returns rpc_error when deleting a missing token", async () => {
    const { session, onMessage } = createSessionForDirectAuthTests();

    await session.handleMessage({
      type: "delete_direct_auth_token_request",
      requestId: "req_missing",
      id: "missing-token",
    });

    expect(onMessage).toHaveBeenCalledWith({
      type: "rpc_error",
      payload: {
        requestId: "req_missing",
        requestType: "delete_direct_auth_token_request",
        error: "Request failed: Direct auth token not found: missing-token",
        code: "handler_error",
      },
    });
  });
});
