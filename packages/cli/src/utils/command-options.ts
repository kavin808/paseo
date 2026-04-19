import type { Command } from "commander";

const JSON_OPTION_DESCRIPTION = "Output in JSON format";
const DAEMON_HOST_OPTION_DESCRIPTION =
  "Daemon host target (default: local socket/pipe, then localhost:6767)";
const DAEMON_TOKEN_OPTION_DESCRIPTION =
  "Direct auth bearer token (or use PASEO_DIRECT_TOKEN)";

export function collectMultiple(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function addJsonOption<T extends Command>(command: T): T {
  command.option("--json", JSON_OPTION_DESCRIPTION);
  return command;
}

export function addDaemonHostOption<T extends Command>(command: T): T {
  command.option("--host <host>", DAEMON_HOST_OPTION_DESCRIPTION);
  command.option("--token <token>", DAEMON_TOKEN_OPTION_DESCRIPTION);
  return command;
}

export function addDaemonConnectionOptions<T extends Command>(command: T): T {
  return addDaemonHostOption(command);
}

export function addJsonAndDaemonHostOptions<T extends Command>(command: T): T {
  return addDaemonConnectionOptions(addJsonOption(command));
}
