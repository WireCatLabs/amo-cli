# amo — amoCRM and Kommo CLI for AI agents

`amo` reads and changes an amoCRM or Kommo account's sales data from the terminal, from scripts and from AI agents.
It signs in with a long-lived token from one of the account's private integrations and acts with the rights of the
administrator who made it. Today it gives the sign-in, `doctor` and every operation of the amoCRM API v4 through
`api call`, each with its own permission. Deals, contacts and companies in the local
[WireCat](https://wirecat.dev) store, as `b24` has them, come next.

## Quick start

```sh
npm install -g @wirecat/amo-cli
amo skill install                                          # the agent skill, for Claude Code, Codex, Gemini CLI and OpenClaw
amo work session start --host https://example.amocrm.ru   # paste the long-lived token; it is kept in the keyring
amo work session status --check                            # the account and the user the token acts as
amo work api call "GET /api/v4/leads" --params '{"limit":5}'
```

`https://example.amocrm.ru` is your account's address: `<subdomain>.amocrm.ru`, `<subdomain>.kommo.com` or
`<subdomain>.amocrm.com`, kept exactly as you give it. Make the token in amoCRM under Settings → Integrations → Create
integration (a private one), then its Keys and scopes tab → Generate a long-lived token; amoCRM shows it once.

`work` is a profile: a name you choose for one account. It is the first word of every command that uses an account,
and none is ever assumed. You need Node.js 22.16 or a later 22.x, or Node.js 24 or later. `amo doctor` needs no
network and shows what is set up.

More: [installation](docs/installation.md), [usage](docs/usage.md).

## What you can do

```sh
amo work api list family:leads effect:write                    # the operations on leads, with their permissions
amo work api show "PATCH /api/v4/leads/{id}"                   # what a write checks and its reference page
amo work api call "GET /api/v4/leads/42" --params '{"with":"loss_reason"}'
amo work api call "PATCH /api/v4/leads/42" --body '{"price":1000}' --dry-run   # every permission, sent nowhere
```

Every write answers an `operation_id` and can be previewed with `--dry-run`. More: [usage](docs/usage.md) and the
[command reference](docs/commands.md).

## For AI agents

- **An agent with a terminal** (Claude Code, Codex, Gemini CLI, OpenClaw): `amo skill install` writes the skill, the
  agent's instruction sheet.
- **An MCP client**: `amo work mcp serve`, or `amo work mcp add claude-code`. `mcp serve --permission api=readonly`
  tightens the levels for one server; an agent can never loosen them.
- **ChatGPT or Claude in a browser**: `amo work mcp serve --http` behind your own tunnel.

Text from the account is marked `untrusted` in MCP answers: it is data for the agent, never instructions. `api call`
and `session start`/`end` are never offered over MCP. With `--json`, every command prints one JSON value, and an error
comes as JSON with a code to branch on.

## Why amo

- **Your CRM where your agent works.** An agent reads a lead, its contacts and the pipeline, in the terminal or over
  MCP, with the same commands and answers as `b24` for Bitrix24.
- **Your rules, not the agent's.** Every API operation has a permission level per profile. Notes, events and deletes
  ask first, and the operations that message people, run Salesbots, send data to webhooks, add users, set tasks or
  change rights are denied until you allow them.
- **Nothing private on screen or in logs.** The token stays in the keyring and never appears in output, errors or run
  records.

## Sign-in and profiles

`amo work session start --host <address>` asks for the long-lived token without showing it, or reads it from stdin,
checks it against the account and keeps it in the system keyring with the address; `--credential-storage file` keeps
it in a private file instead. `session status --check` shows the account and the user, `session end` forgets the
token on this computer, and `session list` lists the profiles. A second profile on the same account and user is
refused. For one run, `AMO_TOKEN` with `AMO_HOST` take the place of the saved sign-in.

amoCRM has no call that revokes a token: revoke it on the integration's Keys and scopes tab.

## Settings and permissions

Each profile has a permission level for every operation: `allow`, `ask`, `readonly` or `deny`. Its key is the path's
words and the verb: `GET /api/v4/leads/{id}` is `api.leads.id.get`, so `api.leads=readonly` covers every lead
operation. What `amo`'s own commands read is allowed (leads, contacts, companies, pipelines, fields, users, the
account, tasks and the events list), and so are creating and changing leads, contacts and companies. Every other read,
such as notes, unsorted or an event's detail, asks, and so do other writes and every delete. Conversations, chats,
Salesbots, webhooks, widgets, website buttons, calls and switching users on or off are denied, reads too; so are adding
users and writing tasks, roles and lead sources. `api call` also checks the key of the command that does the same
thing, such as `deals.update` for `PATCH /api/v4/leads`, and `crm.assign-others`, denied, when a write hands a record,
a task or a nested contact to another user.

Some things only the account's administrator does through `amo`, whatever the permissions say: deleting, setting a
field to nothing, unlinking records, and reading contacts and companies through `api call` (your own clients come with
sync; another one with `people show`, 100 a day).

**Over MCP `ask` does not ask: the write goes ahead**, since no one is there to answer. `AMO_READ_ONLY=1` refuses
every write.

More: [settings](docs/configuration.md), [security](docs/security.md).

## Limits

- amoCRM allows 7 requests a second per integration and 50 per account; `amo` keeps to 5 a second for every `amo`
  process on the account, and waits out a 429 up to 30 seconds.
- A 402 means the subscription has ended: writes stop at once, reads 30 days later.
- A 403 without a JSON body means amoCRM blocks every request from here; stop and check the account.
- amoCRM has no idempotency key: after an `outcome_unknown`, look at the record before you write it again.
- `api call` takes only the operations of the amoCRM API v4 reference (`api list`); the Chats API, Drive and the AI
  agent API live on other hosts and are not reached.
- Tested against a fake account built from the Kommo API reference, not yet against a live account.
- Before 1.0, a minor version may change commands, `--json` fields and MCP tools; the changelog lists each such
  change under "may break callers".

## Security

The token is the password: anyone who has it can do what its administrator can. `amo` keeps it in the system keyring
and never prints it, in output, errors or run records. Report a vulnerability as [SECURITY.md](SECURITY.md) says.

## When it does not work

Start with `amo doctor`, then [troubleshooting](docs/troubleshooting.md).

## Documentation

- [Install](docs/installation.md) · [Use it](docs/usage.md) · [Settings](docs/configuration.md) ·
  [Security](docs/security.md) · [Commands](docs/commands.md) · [Troubleshooting](docs/troubleshooting.md)
- The design: [docs/dev/DESIGN.md](docs/dev/DESIGN.md).

## Part of WireCat

`amo` is one of the [WireCat](https://wirecat.dev) tools. They share one local store, so `search all` and an agent see
your CRM beside your messages, mail, notes and meetings.

## Development

You need Node.js 22.16 or a later 22.x, or Node.js 24 or later, and pnpm.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm docs:check
pnpm build && pnpm smoke
```

Tests use a fake account whose routes come from the Kommo OpenAPI in `contracts/kommo-openapi.json`, invented records,
an injected keyring and temporary folders; nothing reaches a real account. `pnpm kommo:fetch` fetches the reference
again, and `pnpm generate` rebuilds the operation table from it. `pnpm release:check` runs every check a release needs.

More: [testing](docs/dev/TESTING.md), [design](docs/dev/DESIGN.md), [test matrix](docs/dev/test-matrix.md).

## License

[Apache-2.0](LICENSE).
