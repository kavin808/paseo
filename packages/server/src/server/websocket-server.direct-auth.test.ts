import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const wsModuleMock = vi.hoisted(() => {
  class MockWebSocketServer {
    static instances: MockWebSocketServer[] = [];

    constructor(_options: unknown) {
      MockWebSocketServer.instances.push(this);
    }

    on() {
      return this;
    }

    close() {
      // no-op
    }
  }

  return { MockWebSocketServer };
});

const sessionMock = vi.hoisted(() => {
  class MockSession {
    cleanup = vi.fn(async () => {});
    handleMessage = vi.fn(async () => {});
    handleBinaryFrame = vi.fn((_frame: unknown) => {});
    getClientActivity = vi.fn(() => null);
    resetPeakInflight = vi.fn(() => {});
    getRuntimeMetrics = vi.fn(() => ({
      checkoutDiffTargetCount: 0,
      checkoutDiffSubscriptionCount: 0,
      checkoutDiffWatcherCount: 0,
      checkoutDiffFallbackRefreshTargetCount: 0,
      terminalDirectorySubscriptionCount: 0,
      terminalSubscriptionCount: 0,
      inflightRequests: 0,
      peakInflightRequests: 0,
    }));

    constructor(_args: Record<string, unknown>) {}
  }

  return { MockSession };
});

vi.mock("ws", () => ({
  WebSocketServer: wsModuleMock.MockWebSocketServer,
}));

vi.mock("./session.js", () => ({
  Session: sessionMock.MockSession,
}));

vi.mock("./push/token-store.js", () => ({
  PushTokenStore: class {
    getAllTokens(): string[] {
      return [];
    }
  },
}));

vi.mock("./push/push-service.js", () => ({
  PushService: class {
    async sendPush(): Promise<void> {
      // no-op
    }
  },
}));

import { parseServerInfoStatusPayload } from "./messages.js";
import { VoiceAssistantWebSocketServer } from "./websocket-server.js";
import { DirectAuthService } from "./direct-auth/direct-auth-service.js";
import { createTestLogger } from "../test-utils/test-logger.js";

const tempDirs: string[] = [];

class MockSocket {
  readyState = 1;
  bufferedAmount = 0;
  sent: unknown[] = [];
  closeCode: number | null = null;
  closeReason: string | null = null;
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  on(event: "message" | "close" | "error", listener: (...args: any[]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(listener);
    this.listeners.set(event, handlers);
  }

  once(event: "close" | "error", listener: (...args: any[]) => void): void {
    const wrapped = (...args: any[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closeCode = code ?? 1000;
    this.closeReason = reason ?? "";
    this.emit("close", this.closeCode, this.closeReason);
  }

  emit(event: "message" | "close" | "error", ...args: any[]): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of [...handlers]) {
      handler(...args);
    }
  }

  private off(event: "close" | "error", listener: (...args: any[]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      handlers.filter((handler) => handler !== listener),
    );
  }
}

function makeTempHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "paseo-ws-direct-auth-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createHelloMessage(clientId: string, token?: string) {
  return {
    type: "hello" as const,
    clientId,
    clientType: "cli" as const,
    protocolVersion: 1,
    ...(token ? { auth: { type: "bearer" as const, token } } : {}),
  };
}

function createDirectRequest() {
  return {
    headers: {
      host: "example.com:6767",
      origin: "http://example.com:6767",
      "user-agent": "vitest",
    },
    socket: {
      remoteAddress: "10.0.0.5",
    },
    url: "/ws",
  };
}

function createServer(input?: {
  directAuthMode?: "off" | "bearer";
  directAuthService?: DirectAuthService | null;
}) {
  const daemonConfigStore = {
    onChange: vi.fn(() => () => {}),
    get: vi.fn(() => ({
      directAuth: {
        mode: input?.directAuthMode ?? "off",
        enforceOnNonLoopback: false,
      },
      mcp: { injectIntoAgents: false },
    })),
  };

  return new VoiceAssistantWebSocketServer(
    {} as any,
    createTestLogger() as any,
    "srv-test",
    {
      setAgentAttentionCallback: vi.fn(),
      getAgent: vi.fn(() => null),
      getMetricsSnapshot: vi.fn(() => ({
        totalAgents: 0,
        idleAgents: 0,
        runningAgents: 0,
        pendingPermissionAgents: 0,
        erroredAgents: 0,
      })),
    } as any,
    {} as any,
    {} as any,
    makeTempHome(),
    daemonConfigStore as any,
    input?.directAuthService ?? null,
    null,
    { allowedOrigins: new Set() },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "1.2.3-test",
    undefined,
    undefined,
    undefined,
    {} as any,
    {} as any,
    {} as any,
    {
      subscribe: vi.fn(),
      scheduleRefreshForCwd: vi.fn(),
      getMetrics: vi.fn(() => ({
        checkoutDiffTargetCount: 0,
        checkoutDiffSubscriptionCount: 0,
        checkoutDiffWatcherCount: 0,
        checkoutDiffFallbackRefreshTargetCount: 0,
      })),
      dispose: vi.fn(),
    } as any,
  );
}

describe("VoiceAssistantWebSocketServer direct auth", () => {
  test("allows direct hello without token when direct auth is off", async () => {
    const server = createServer({ directAuthMode: "off" });
    const socket = new MockSocket();

    await (server as any).attachSocket(socket, createDirectRequest());
    socket.emit("message", JSON.stringify(createHelloMessage("cid-direct-off")));
    await Promise.resolve();

    expect(socket.closeCode).toBeNull();
    expect(socket.sent.length).toBeGreaterThan(0);
  });

  test("rejects direct hello without token when direct auth is required", async () => {
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
    });
    const server = createServer({ directAuthMode: "bearer", directAuthService: service });
    const socket = new MockSocket();

    await (server as any).attachSocket(socket, createDirectRequest());
    socket.emit("message", JSON.stringify(createHelloMessage("cid-direct-missing")));
    await Promise.resolve();

    expect(socket.closeCode).toBe(4004);
    expect(socket.closeReason).toBe("Authentication required");
    expect(socket.sent).toHaveLength(0);
  });

  test("rejects direct hello with an invalid token", async () => {
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
    });
    const server = createServer({ directAuthMode: "bearer", directAuthService: service });
    const socket = new MockSocket();

    await (server as any).attachSocket(socket, createDirectRequest());
    socket.emit("message", JSON.stringify(createHelloMessage("cid-direct-invalid", "bad-token")));
    await Promise.resolve();

    expect(socket.closeCode).toBe(4005);
    expect(socket.closeReason).toBe("Invalid token");
  });

  test("allows direct hello with a valid token", async () => {
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
    });
    const issued = service.issueToken({ label: "CLI" });
    const server = createServer({ directAuthMode: "bearer", directAuthService: service });
    const socket = new MockSocket();

    await (server as any).attachSocket(socket, createDirectRequest());
    socket.emit("message", JSON.stringify(createHelloMessage("cid-direct-valid", issued.token)));
    await Promise.resolve();

    expect(socket.closeCode).toBeNull();
    expect(socket.sent.length).toBeGreaterThan(0);
    const envelope = JSON.parse(String(socket.sent[0])) as {
      type?: unknown;
      message?: { type?: unknown; payload?: unknown };
    };
    expect(envelope.type).toBe("session");
    expect(envelope.message?.type).toBe("status");
    expect(parseServerInfoStatusPayload(envelope.message?.payload)).not.toBeNull();
  });

  test("skips direct auth for relay sockets", async () => {
    const service = new DirectAuthService({
      logger: createTestLogger(),
      paseoHome: makeTempHome(),
    });
    const server = createServer({ directAuthMode: "bearer", directAuthService: service });
    const socket = new MockSocket();

    await server.attachExternalSocket(socket, { transport: "relay" });
    socket.emit("message", JSON.stringify(createHelloMessage("cid-relay-no-token")));
    await Promise.resolve();

    expect(socket.closeCode).toBeNull();
    expect(socket.sent.length).toBeGreaterThan(0);
  });
});
