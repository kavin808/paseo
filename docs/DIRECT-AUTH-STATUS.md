# Direct Auth Status

## Scope

This document summarizes the current implementation status of direct auth on branch `feat/direct-auth-foundation`.

It complements [docs/DIRECT-AUTH-DESIGN.md](/home/kavin/workspaces/paseo_fork/paseo/docs/DIRECT-AUTH-DESIGN.md:1) and focuses on:

- what is implemented
- how the current flow works
- what remains out of scope

## Implemented

### 1. Direct hello auth

Direct connections now support optional bearer auth during the WebSocket `hello` handshake.

Implemented behavior:

- `WSHelloMessage` accepts optional `auth`
- daemon config supports `directAuth`
- direct connections validate `hello.auth` when `directAuth.mode === "bearer"`
- relay connections skip direct auth

Current direct auth close codes:

- `4004` authentication required
- `4005` invalid / expired / revoked token

### 2. Daemon token storage and validation

The daemon now has a local direct-auth token service.

Current token model:

- `persistent`
- `temporary`

Stored metadata:

- `id`
- `kind`
- `label`
- `createdAt`
- `expiresAt`
- `revokedAt`
- `lastUsedAt`

Storage location:

```text
$PASEO_HOME/direct-auth/
├── salt
└── tokens.json
```

Current storage rule:

- daemon stores only `tokenHash`
- daemon does not persist plaintext token values

### 3. Shared client and CLI token transport

`DaemonClient` supports:

- `directAuth?: { type: "bearer"; token: string }`

When present, the client sends:

```ts
auth: {
  type: "bearer",
  token,
}
```

in `hello`.

CLI direct connections support:

- `--token`
- `PASEO_DIRECT_TOKEN`

### 4. App direct host support

The app now supports storing and sending a token on direct hosts.

Implemented app behavior:

- direct host connections may include optional bearer auth
- direct probe path forwards token
- runtime direct connections forward token
- manual add-host flow supports optional token input

### 5. Daemon CLI token management

The daemon CLI now exposes token lifecycle commands:

- `paseo daemon token create`
- `paseo daemon token ls`
- `paseo daemon token revoke <id>`
- `paseo daemon token rotate <id>`

Current command behavior:

- these commands operate on local `PASEO_HOME` state
- they do not use the direct websocket session path
- `create` returns a new plaintext token once
- `ls` returns metadata only
- `revoke` invalidates the token server-side
- `rotate` replaces the token value and returns the new plaintext token once

### 6. App saved-token editing

The app does not manage daemon token lifecycle.

Instead, the host settings page now supports editing the locally saved token for a connection.

Current UI behavior:

- `Edit token` and `Remove token` appear only for direct connections that already have bearer auth
- relay connections never show these actions
- direct connections without a saved token do not show these actions

Important distinction:

- app `Remove token` removes the saved token from this device only
- CLI `revoke token` invalidates the token on the daemon

## Current user flows

### Manual direct-auth flow

1. User creates a token on the daemon
2. User configures the token in CLI or app
3. Client opens direct socket
4. Client sends `hello.auth`
5. Daemon validates token
6. Session starts on success

### CLI token flow

1. Run `paseo daemon token create`
2. Copy returned token
3. Use it with:
   - `--token`
   - `PASEO_DIRECT_TOKEN`

Important distinction:

- `paseo daemon token *` is local daemon-state management against `PASEO_HOME`
- normal CLI commands like `paseo ls` still connect to the daemon and must satisfy direct auth when bearer mode is enabled

### App token flow

1. Add a direct host manually
2. Enter `host:port`
3. Enter token optionally
4. App probes and stores the connection
5. Later, use host settings to edit or remove the saved token

## Explicitly not implemented

The following are still out of scope on this branch:

- direct pairing protocol
- pairing QR / link import for direct endpoint + token
- app token lifecycle management UI
- automatic temporary-token to persistent-token upgrade flow
- default non-loopback enforcement policy at product level

## Direct pairing gap

Current pairing supports relay workflows, not the direct-auth workflow added on this branch.

That means:

- pairing does not import direct endpoint + bearer token together
- direct-auth connections are currently configured manually

## Review boundary

This branch should be reviewed as:

`optional end-to-end bearer auth for direct connections, plus daemon CLI token management and app-side saved-token editing`

It should not be reviewed as:

- full direct pairing support
- full token management product UX inside the app
