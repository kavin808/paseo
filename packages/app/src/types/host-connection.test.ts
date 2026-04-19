import { describe, expect, it } from "vitest";

import { normalizeStoredHostProfile } from "./host-connection";

describe("host-connection direct auth", () => {
  it("preserves bearer auth when normalizing stored direct connections", () => {
    const profile = normalizeStoredHostProfile({
      serverId: "srv_auth",
      label: "auth host",
      preferredConnectionId: "direct:lan:6767",
      connections: [
        {
          id: "direct:lan:6767",
          type: "directTcp",
          endpoint: "lan:6767",
          auth: {
            type: "bearer",
            token: "paseo_dt_app_saved",
          },
        },
      ],
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    });

    expect(profile).not.toBeNull();
    expect(profile?.connections[0]).toEqual({
      id: "direct:lan:6767",
      type: "directTcp",
      endpoint: "lan:6767",
      auth: {
        type: "bearer",
        token: "paseo_dt_app_saved",
      },
    });
  });
});
