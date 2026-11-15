# Use it

This page explains how a command is built, and how an agent uses the tool. Read it before your first command.

## The profile comes first

A profile is a name you choose for one account. It is the first word of every command that uses an account:

```sh
amo work config show
```

`AMO_PROFILE=work` does the same for one shell session. No profile is ever assumed, not even the only one: a
command without one stops with exit code 2 and lists the profiles on this computer.

## Sign in

Make a private integration in amoCRM (Settings → Integrations → Create integration), open its Keys and scopes tab
and generate a long-lived token; amoCRM shows it once. Then give the account's address and paste the token:

```sh
amo work session start --host https://example.amocrm.ru
amo work session status --check
```

The token is read without showing it, or from stdin, and kept in the system keyring with the address. The address
stays as you give it: `<subdomain>.amocrm.ru`, `<subdomain>.kommo.com` or `<subdomain>.amocrm.com`. The token acts
with the rights of the administrator who made it.

## Call the API

`amo work api list` lists every operation of the amoCRM API v4, named `<HTTP verb> <path>`, with its permission key
and the reference page. `api call` sends one, the query and the body as JSON:

```sh
amo work api call "GET /api/v4/leads" --query '{"limit":5,"with":"contacts"}'
amo work api call "PATCH /api/v4/leads/42" --body '{"price":1000}' --dry-run
```

`--dry-run` shows every permission the call checks and sends nothing.

## Output for scripts

Every command except `mcp serve` on stdin and stdout takes `--json`, and prints one JSON value on stdout. Errors are JSON on stderr, with a code to branch
on. The [command reference](commands.md) lists the codes.

## Agents

`amo skill install` puts the tool's skill where Claude Code, Codex, Gemini CLI and OpenClaw look for it.
`amo skill install --for hermes` also adds that folder to Hermes Agent's own settings, so a bare `skill install`
leaves Hermes out. `amo work mcp serve` serves the profile's commands over MCP, on stdin and stdout:

```sh
claude mcp add amo -- amo work mcp serve
```

The server offers every command, the ones that write included. The profile's permissions decide what runs; see
[settings](configuration.md#permissions).

For ChatGPT and Claude in the browser,
`amo work mcp serve --http --public-url https://laptop.example.ts.net` serves on `127.0.0.1` (port 8765, or
`--port`) behind your own tunnel. A browser app logs in with a one-time code that the command prints;
`amo work mcp revoke` ends every login. `amo work mcp server start` runs the same
server in the background, `mcp server status` shows its port, the login code and the apps logged in, and
`mcp server stop` ends it.
