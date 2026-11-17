# MCP

Give your amoCRM or Kommo CRM to an AI agent that cannot run commands, such as Claude Desktop, or ChatGPT and Claude
in the browser. MCP (Model Context Protocol) is the way such an agent asks a program what it can do and then calls it,
and `amo` serves its commands that way.

The agent then reads your deals, contacts and companies, and changes them as far as the profile's permissions allow.

`amo work mcp add` adds the server to Claude Code or Codex, and `amo work mcp config` prints the entry for any other
client. An agent with a terminal, such as Claude Code or Codex, does better with the commands and the skill
(`amo skill install`). You need a signed-in profile, and a look at [Permissions](permissions.md) first: over MCP a
write at `ask` goes ahead.

**On this page:**

1. [Add amo to an agent](#add-amo-to-an-agent)
2. [What the agent sees](#what-the-agent-sees)
3. [Keep writes yours](#keep-writes-yours)
4. [ChatGPT and Claude in the browser](#chatgpt-and-claude-in-the-browser)

## Add amo to an agent

```sh
amo work mcp add claude-code --allow-writes   # or codex
amo work mcp check                            # the handshake and the tool list, as the client sees them
```

`--allow-writes` says you know the profile offers tools that write. For any other client, `amo work mcp config`
prints the entry to paste into its settings. By hand, for Claude Code:

```sh
claude mcp add amo -- amo work mcp serve
```

One server can serve several profiles: `amo mcp serve --profiles work,sales`, or `--profiles all`. Each call then
names its profile, and the agent asks you if you did not say which.

## What the agent sees

The server has three tools:

- `amo_tools_search` finds a command by words, with its arguments and the shape of its answer.
- `amo_read` runs a command that only reads: `{ "command": "deals list", "arguments": { "query": "status:open" } }`.
- `amo_write` runs a command that writes: `{ "command": "deals move", "arguments": { "deal": "deal:12", ... } }`.

A command is named as on the command line, without the profile, and checks the same permission key. These are never
offered over MCP: `api call`, `session start` and `session end`. The agent asks you to run them yourself.

Text from the account comes marked `untrusted`: deal, contact and company names, pipeline and stage names, user names,
custom field values, notes and tags, phones, e-mails and links. The agent is told it is data, never instructions.

## Keep writes yours

Over MCP nobody is at a terminal to answer `ask`, so the write goes ahead. Moving, closing and changing deals,
contacts and companies is `allow` for a new profile anyway, and a moved deal can start amoCRM's own digital pipeline
triggers and Salesbot, which may write to a real client.

Choose one before you add the server:

- Set `readonly` or `deny` for each write the agent must not make:
  `amo work config set permissions.deals.move readonly`. The full list is in
  [Permissions](permissions.md#what-a-new-profile-allows).
- Or turn on approval for the `amo_write` tool in your agent's client, so the client asks you before each write.

To make one server stricter than the profile, give it its own levels. They never loosen the profile:

```sh
amo work mcp add claude-code --allow-writes --permission deals.close=deny
amo work mcp serve --permission deals=readonly
```

## ChatGPT and Claude in the browser

A browser app reaches the server over HTTP through your own tunnel, such as Tailscale Funnel. The command below uses
the example address `https://laptop.example.ts.net`. Put your tunnel's address in its place:

```sh
amo work mcp serve --http --public-url https://laptop.example.ts.net
```

The server listens on `127.0.0.1` only, port 8765 (`--port` changes it). A browser app logs in with a one-time code
the command prints. `amo work mcp revoke` ends every login.

`amo work mcp server start` runs the same server in the background. `mcp server status` shows its port, the login
code and the apps logged in, and `mcp server stop` ends it.

More: [permissions](permissions.md), [security](security.md), [the command reference](commands.md#amo-mcp).
