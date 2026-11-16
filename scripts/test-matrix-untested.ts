const SHARED_MCP =
  "cli-core's appMcpCommand; its app-mcp-command and mcp-server-command tests drive it, and src/mcp.test.ts runs " +
  "this CLI's own server, config, revoke and refusals"
const SHARED_REPORTS = "cli-core's appDoctorCommand; its app-mcp-command test creates and shows a report"
const SHARED_STORE =
  "cli-core's addStoreMaintenanceCommands, mounted by addCrmCommands; its store and src/crm/cli/store-file tests " +
  "drive them on a CRM program"
const SHARED_SCHEDULE =
  "cli-core's scheduleCommandFor; its schedule tests drive every timer and option, and src/schedule.test.ts installs, " +
  "lists and removes amo's sync timer"
const LONG_RUNNING = `starts an HTTP server or a background process that runs until stopped; ${SHARED_MCP}`

export const UNTESTED: { command: string; option?: string; reason: string }[] = [
  ...[
    ...["--at-time", "--notify-on", "--deliver-to"].map((option) => ({ command: "schedule command", option })),
    { command: "schedule agent" },
    ...[
      "--model",
      "--max-cost",
      "--allow-dangerous",
      "--max-cost-per-day",
      "--every",
      "--at",
      "--at-time",
      "--notify-on",
      "--deliver-to",
    ].map((option) => ({ command: "schedule agent", option })),
    ...["--no-notify", "--deliver-to"].map((option) => ({ command: "schedule run", option })),
    { command: "schedule pause" },
    { command: "schedule resume" },
    { command: "schedule agents list" },
  ].map((one) => ({ ...one, reason: SHARED_SCHEDULE })),
  {
    command: "setup",
    reason:
      "cli-core's setupCommand asks the flow's questions in a terminal; its setup-command tests drive that, and " +
      "src/setup/flow.test.ts runs this flow through setup apply and setup run apply",
  },
  { command: "store status", reason: SHARED_STORE },
  { command: "store info", reason: SHARED_STORE },
  { command: "store check", reason: SHARED_STORE },
  { command: "store migrate", reason: SHARED_STORE },
  { command: "store rebuild", reason: SHARED_STORE },
  { command: "store backup", reason: SHARED_STORE },
  { command: "store backup", option: "--encrypt", reason: SHARED_STORE },
  { command: "store restore", reason: SHARED_STORE },
  { command: "store decrypt", reason: SHARED_STORE },
  { command: "store decrypt", option: "--output", reason: SHARED_STORE },
  { command: "store repair", reason: SHARED_STORE },
  { command: "store repair", option: "--dry-run", reason: SHARED_STORE },
  { command: "store reset", reason: SHARED_STORE },
  { command: "store reset", option: "--no-backup", reason: SHARED_STORE },
  { command: "store reset", option: "--dry-run", reason: SHARED_STORE },
  { command: "store copies delete", reason: SHARED_STORE },
  { command: "store tables list", reason: SHARED_STORE },
  { command: "store apply", reason: SHARED_STORE },
  { command: "store apply", option: "--yes", reason: SHARED_STORE },
  { command: "store recover", reason: SHARED_STORE },
  { command: "store recover run", reason: SHARED_STORE },
  {
    command: "",
    option: "--help-all",
    reason: "Commander answers before any command runs, so the trace never sees it; contracts/help.snap covers help",
  },
  {
    command: "",
    option: "--version",
    reason: "Commander answers before any command runs, so the trace never sees it; `pnpm version:check` checks it",
  },
  {
    command: "mcp server start",
    reason:
      "starts a detached `mcp serve --http` from the built entry; cli-core tests mcpServerCommand, and the background run was checked by hand against dist/",
  },
  {
    command: "mcp server start",
    option: "--port",
    reason:
      "starts a detached `mcp serve --http` from the built entry; cli-core tests mcpServerCommand, and the background run was checked by hand against dist/",
  },
  {
    command: "mcp server start",
    option: "--public-url",
    reason:
      "starts a detached `mcp serve --http` from the built entry; cli-core tests mcpServerCommand, and the background run was checked by hand against dist/",
  },
  {
    command: "mcp server stop",
    reason:
      "stops the detached server that `mcp server start` wrote a pid file for; cli-core tests mcpServerCommand, and no live scenario starts a server to stop",
  },
  ...["--http", "--port", "--public-url"].map((option) => ({ command: "mcp serve", option, reason: LONG_RUNNING })),
  { command: "doctor reports show", reason: SHARED_REPORTS },
  { command: "doctor reports create", reason: SHARED_REPORTS },
  { command: "doctor reports create", option: "--run", reason: SHARED_REPORTS },
  { command: "doctor reports create", option: "--output", reason: SHARED_REPORTS },
  { command: "mcp server status", reason: LONG_RUNNING },
  { command: "mcp server status", option: "--profiles", reason: LONG_RUNNING },
  { command: "mcp revoke", option: "--profiles", reason: SHARED_MCP },
  ...[undefined, "--allow-writes", "--permission"].map((option) => ({
    command: "mcp add",
    ...(option ? { option } : {}),
    reason: `writes Codex's or Claude Code's own MCP settings; ${SHARED_MCP}`,
  })),
  ...[undefined, "--permission"].map((option) => ({
    command: "mcp check",
    ...(option ? { option } : {}),
    reason: `starts the installed CLI as a child process, as the agent would; ${SHARED_MCP}`,
  })),
]
