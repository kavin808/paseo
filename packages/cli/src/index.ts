import { classifyInvocation } from "./classify.js";

async function tryRunDaemonTokenShortcut(argv: string[]): Promise<boolean> {
  if (argv[0] !== "daemon" || argv[1] !== "token") {
    return false;
  }

  const [{ Command }, { tokenCommand }] = await Promise.all([
    import("commander"),
    import("./commands/daemon/token.js"),
  ]);

  const program = new Command();
  const daemon = new Command("daemon").description("Manage the Paseo daemon");
  daemon.addCommand(tokenCommand());
  program.name("paseo").addCommand(daemon);
  program.parse([...process.argv.slice(0, 2), ...argv], { from: "node" });
  return true;
}

if (await tryRunDaemonTokenShortcut(process.argv.slice(2))) {
  process.exit(0);
}

const [{ createCli }, { openDesktopWithProject }] = await Promise.all([
  import("./cli.js"),
  import("./commands/open.js"),
]);

const program = createCli();
const knownCommands = new Set(program.commands.map((command) => command.name()));

const invocation = classifyInvocation({
  argv: process.argv.slice(2),
  knownCommands,
  cwd: process.cwd(),
});

switch (invocation.kind) {
  case "cli": {
    const argv = [...process.argv.slice(0, 2), ...invocation.argv];
    if (invocation.argv.length === 0) {
      argv.push("onboard");
    }
    program.parse(argv, { from: "node" });
    break;
  }
  case "open-project":
    await openDesktopWithProject(invocation.resolvedPath);
    break;
}
