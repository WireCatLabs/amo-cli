### Changed — may break callers

- **amo is built on cli-core 2.0.0.** After its first run the store is at version 78, and only tools on cli-core 2.0
  open it: upgrade every WireCat CLI and WireCat Desktop on this computer together, and stop `serve`, `mcp` and syncs
  while it migrates. The migration keeps a rollback copy first. In `--json`, an agent that wrote a deal's task or
  note is `type: "agent"` where it was `"bot"`, and a sender bot ref is `bot:<id>` where it was `sender-bot:<id>`.
