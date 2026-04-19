# Direct Auth Manual Build And Verification

## Goal

This document gives a copy-paste manual verification plan for the direct-auth work on branch `feat/direct-auth-foundation`.

It is organized by:

- server
- CLI
- web app
- Android app
- iOS app
- desktop app

## Current practical guidance

For this branch, the most reliable self-test path is:

1. build and run the server
2. use the CLI in source mode
3. verify the web app

This is recommended because the `@getpaseo/cli` workspace currently has existing build/typecheck baseline issues unrelated to this direct-auth work.

## Common setup

Use an isolated `PASEO_HOME` so you do not mix this branch with your main daemon state:

```bash
export PASEO_HOME=~/.paseo-direct-auth
```

If needed:

```bash
mkdir -p "$PASEO_HOME"
```

Install dependencies once from repo root:

```bash
npm install --workspaces --include-workspace-root
```

## 1. Server

### Build

Run from repo root:

```bash
npm run build --workspace=@getpaseo/highlight
npm run build --workspace=@getpaseo/relay
npm run build --workspace=@getpaseo/server
```

### Start

```bash
PASEO_HOME=~/.paseo-direct-auth npm run start --workspace=@getpaseo/server
```

Alternative direct start:

```bash
PASEO_HOME=~/.paseo-direct-auth node packages/server/dist/server/server/index.js
```

### Verify

Check the daemon log:

```bash
tail -f "$PASEO_HOME/daemon.log"
```

Expected:

- daemon starts cleanly
- no direct-auth schema errors
- direct connections can later authenticate with bearer token

## 2. CLI

## Recommendation

Use CLI in source mode for manual verification on this branch.

Do not depend on `npm run build --workspace=@getpaseo/cli` as the only gate for this branch, because the CLI workspace has existing baseline issues outside direct-auth.

Important:

- `daemon token create/ls/delete/rotate` are local management commands against `PASEO_HOME`
- they do not need an existing direct-auth bearer token
- normal direct CLI commands still connect to the daemon and do require bearer auth when enabled

### Source-mode CLI

From repo root:

```bash
npm run cli -- daemon token create --label phone --temporary --ttl 300
npm run cli -- daemon token ls
```

Equivalent direct invocation:

```bash
node --import tsx packages/cli/src/index.ts daemon token create --label phone --temporary --ttl 300
node --import tsx packages/cli/src/index.ts daemon token ls
```

### Token lifecycle verification

Create a token:

```bash
PASEO_HOME=~/.paseo-direct-auth npm run cli -- daemon token create --label phone --temporary --ttl 300 --json
```

List tokens:

```bash
PASEO_HOME=~/.paseo-direct-auth npm run cli -- daemon token ls --json
```

Rotate a token:

```bash
PASEO_HOME=~/.paseo-direct-auth npm run cli -- daemon token rotate <token-id> --json
```

Delete a token:

```bash
PASEO_HOME=~/.paseo-direct-auth npm run cli -- daemon token delete <token-id> --json
```

### Direct connection verification

Use a token returned by `create` or `rotate`:

```bash
PASEO_HOME=~/.paseo-direct-auth PASEO_DIRECT_TOKEN=<token> npm run cli -- ls -a -g
```

or:

```bash
PASEO_HOME=~/.paseo-direct-auth npm run cli -- --token <token> ls -a -g
```

Expected:

- `create` returns plaintext token once
- `ls` returns metadata only
- `rotate` returns a new plaintext token
- `delete` removes the token record from local daemon state
- token management continues to work even after daemon bearer mode is enabled, because it does not go through the direct websocket auth path
- direct CLI commands work when valid token is supplied

## 3. Web App

### Start

From repo root:

```bash
npm run web
```

### Optional production-style web build

```bash
npm run build:web --workspace=@getpaseo/app
```

Build output:

```text
packages/app/dist
```

### Verify

Open the app in a browser and manually verify:

1. Add a direct host
2. Enter `host:port`
3. Enter a valid direct-auth token
4. Confirm the host connects
5. Open host settings
6. For a direct host with saved token, confirm:
   - `Edit token` is visible
   - `Remove token` is visible
7. For a relay host, confirm:
   - no token actions are shown
8. For a direct host without saved token, confirm:
   - no token actions are shown

Expected:

- add-host modal accepts optional token
- direct host stores and uses token
- host settings only expose token controls for direct connections that already have bearer auth

## 4. Android App

### Debug build

From repo root:

```bash
npm run android:development
```

### Release build

```bash
npm run android:production
```

### Verify

On device or emulator:

1. Add a direct host manually
2. Save a token
3. Confirm connection succeeds
4. Open host settings
5. Confirm `Edit token` and `Remove token` only show for direct-auth connections

## 5. iOS App

### Debug run

From repo root:

```bash
npm run ios
```

### Release-style run

```bash
npm run ios:release --workspace=@getpaseo/app
```

### Verify

On simulator or device:

1. Add a direct host manually
2. Save a token
3. Confirm connection succeeds
4. Confirm token edit/remove controls follow the same rules as web

## 6. Desktop App

## Recommendation

Desktop validation is optional for this branch unless you specifically need to verify Electron packaging or desktop-managed daemon workflows.

### Development run

From repo root:

```bash
npm run dev:desktop
```

### Production build

```bash
npm run build:desktop
```

This command will:

1. sync internal versions
2. build app web assets
3. build daemon dependencies
4. package the Electron app

Build output:

```text
packages/desktop/release
```

### Verify

In desktop app:

1. open a host that uses direct auth
2. verify saved token behavior matches web app
3. confirm no token controls appear for relay connections

## Recommended end-to-end self-check

If you want the shortest realistic self-check before PR, run:

```bash
export PASEO_HOME=~/.paseo-direct-auth
npm run build --workspace=@getpaseo/highlight
npm run build --workspace=@getpaseo/relay
npm run build --workspace=@getpaseo/server
PASEO_HOME=~/.paseo-direct-auth npm run start --workspace=@getpaseo/server
```

In another shell:

```bash
export PASEO_HOME=~/.paseo-direct-auth
npm run cli -- daemon token create --label phone --temporary --ttl 300 --json
npm run web
```

Then manually verify in the web app:

1. add direct host
2. paste token
3. connect
4. edit token
5. remove token

## Known baseline issues

### CLI workspace

`@getpaseo/cli` currently has existing workspace-level build/typecheck issues unrelated to this direct-auth work.

Implication:

- source-mode CLI is the recommended manual verification path for this branch
- do not use failing full CLI build as the only signal that direct-auth is broken

### App test environment noise

App focused tests may print existing Expo and AsyncStorage stderr noise in Node test runs.

Implication:

- treat passing test status as the signal
- do not treat those known stderr lines as a direct-auth regression by default
