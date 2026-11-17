# amo: amoCRM and Kommo CLI for AI agents

<p align="center">
  Know where every deal stands and what changed overnight, without opening amoCRM. Ask your AI agent, and it answers
  from a copy of your deals on your computer, even offline. It moves and closes deals for you too, as far as you allow.
</p>

<p align="center">
  <a href="https://github.com/WireCatLabs/amo-cli/blob/main/docs/index.md">Docs</a> ·
  <a href="https://github.com/WireCatLabs/amo-cli/blob/main/docs/installation.md">Install</a> ·
  <a href="https://github.com/WireCatLabs/amo-cli/blob/main/docs/usage.md">Usage</a> ·
  <a href="https://t.me/wirecatdev">Telegram</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wirecat/amo-cli"><img src="https://img.shields.io/npm/v/@wirecat/amo-cli" alt="npm"></a>
  <a href="https://github.com/WireCatLabs/amo-cli/actions/workflows/ci.yml"><img src="https://github.com/WireCatLabs/amo-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/WireCatLabs/amo-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache 2.0"></a>
</p>

- **Ask instead of clicking.** "Which deals are stuck in Quote sent?" gets an answer in a second, in Claude Code, Codex
  or any app that speaks MCP.
- **The morning starts with what changed.** A short digest of yesterday's wins, losses and moves arrives before you
  open the CRM.
- **Nothing happens behind your back.** Every action has its own permission, and nothing reaches a client until you
  allow it.

## What you get

- **The answer, not the search.** Ask about a deal, a client or a stage in your own words. The agent finds the deal
  with its amount and owner, and the phones of the people on it.
- **The funnel at a glance.** How far deals get this month, at which stage they drop off, and how much of it you won.
- **Changes by asking.** "Move Example kitchen to Negotiation" or "close it as lost, the price was too high" is enough.
  The agent finds the stage by its name.
- **One search across your work.** A deal turns up next to the chat where you agreed on it and the meeting where you
  discussed it, if you use the other WireCat tools.

```text
You:    What changed in the CRM since yesterday?
Agent:  (runs amo work changes list "at>=1d")
        · New deal "Example kitchen", 15 000 EUR, in Quote sent
        · "Example office" won, 8 200 EUR
        · Task "Call back about the quote" added on "Example kitchen"
You:    Move Example kitchen to Negotiation.
Agent:  (runs amo work deals move deal:12 "Negotiation")
        Done. "Example kitchen" is in Negotiation now.
```

## Why amo

- **A copy of your deals on your computer.** `sync` copies your deals with their contacts and companies, and the next
  sync takes only the changes. Lists, the funnel and search then answer with no request to amoCRM, also offline. None
  of the other tools in the comparison documents a copy like this.
- **A permission on every action.** Each command and each operation of the amoCRM API has its own level: allow, ask,
  read only or deny. Messages to clients, Salesbots and webhooks are denied until you allow them, and
  `AMO_READ_ONLY=1` stops every write.
- **The token stays in the system keyring.** It never appears in output, errors or run records, and no command takes
  it as an argument.
- **A digest of what changed.** `changes list` shows what each sync saw change, and a schedule sends it to you every
  morning.
- **Your CRM beside your other context.** Deals sit in the same local store as your messages, notes and meetings from
  the other WireCat tools, and `search all` finds them together.
- **amoCRM and Kommo, as many accounts as you need.** Each account is a profile you name in the command, and none is
  ever picked for you.
- **Free and open source.** Apache 2.0.

How it compares with other amoCRM and Kommo tools and MCP servers:
[the comparison](https://wirecat.dev/en/docs/amo/compare). Another tool fits better when an agent should set tasks
and write notes by itself. In `amo` that takes `api call` at a terminal, after you allow it.

## Quick start

An account administrator first makes one private integration in amoCRM or Kommo. Its token is the key `amo` signs in
with. [Install and connect](docs/installation.md) shows each click.

Then find your account's address, the one you open the CRM at. The commands below use the example
`https://example.amocrm.ru`. Put your own address in its place.

```sh
npm install -g @wirecat/amo-cli
amo skill install                                          # the agent skill, for Claude Code, Codex and Gemini CLI
amo work session start --host https://example.amocrm.ru   # paste the token when asked, it goes to the keyring
amo work sync                                              # copy your deals and their clients
amo work deals list status:open
```

`work` is a profile, a name you choose for this account. It is the first word of every command that uses the
account. An address can also end in `.kommo.com` or `.amocrm.com`. You need Node.js 22.16 or a later 22.x, or
Node.js 24 or later. `amo doctor` shows what is set up and needs no network.

More: [install and connect](docs/installation.md), with the browser sign-in and WireCat Desktop.

## Use it with your agent

Ask in plain words. The agent picks the commands.

> *"Use amo. Which deals are waiting in Quote sent, and for how much?"*
> *"Use amo. What changed in the CRM since yesterday?"*
> *"Use amo. Close the Example office deal as lost, the client chose another supplier."*

- **Claude Code, Codex, Gemini CLI, OpenClaw** and other agents with a terminal run `amo` themselves.
  `amo skill install` teaches them how.
- **Claude Desktop, Cursor** and other MCP apps connect to `amo work mcp serve`.
- **ChatGPT or Claude in the browser** reach it through your own tunnel, after a login with a one-time code.

```sh
amo work mcp add claude-code --allow-writes   # or: codex
amo work mcp config                           # the entry for Claude Desktop, Cursor and others
```

Text from the account reaches the agent marked as untrusted, so the agent reads it as data, never as instructions.
`api call` and the sign-in commands are not offered over MCP.

More: [agents and MCP](docs/usage.md#agents)

## What it can do

### Deals and the pipeline

```sh
amo work deals list stage:"Quote sent"                   # from the copy, offline too
amo work pipelines show Sales --since-time 30d           # the board and the funnel, with the win rate
amo work deals move deal:12 "Negotiation"                # a stage by its name
amo work deals close deal:12 lost --reason "Example: chose another supplier"
```

Create and update deals with the CRM's own fields by their labels. `--dry-run` shows what a change would do and the
permissions it checks.

More: [use it](docs/usage.md#read-your-deals)

### Contacts and companies

```sh
amo work people list "Anna"                              # any contact in the account, read live
amo work organizations list "Example LLC"
amo work organizations update 9 --name "Example Ltd"
```

The copy keeps only the clients on your deals. Any other client is read live from the account.

### Tasks and what changed

```sh
amo work activities list overdue:true                    # open tasks past their due time
amo work changes list "at>=1d"                           # what changed in the last day
amo work schedule command crm-digest --at 08:30 -- changes list --format report
```

Tasks, comments and calls are copied once you turn on the activities setting. The digest goes to a desktop notice,
or to Telegram or a mailbox through your own WireCat `tg` or `mail`.

More: [tasks and the digest](docs/usage.md#tasks-and-what-changed)

### Any API operation

```sh
amo work api list family:leads effect:write              # every operation on deals, with its permission
amo work api call "GET /api/v4/leads" --params '{"limit":5}'
```

Every operation of amoCRM's API v4 reference can be called, each checked against its own permission.

More: [call the API](docs/usage.md#call-the-api)

### With your other sources

`amo` keeps your deals in the same local store as the other WireCat tools, such as Telegram, MAX, mail and Google
Calendar. `amo work search all "Example LLC"` finds the deal beside the messages and meetings that mention it.

More: [WireCat](https://wirecat.dev)

## How it works

- **Two ways to sign in.** A long-lived token acts with the rights of the administrator who made it. A sign-in through
  the integration in the browser acts with the rights of the person who signs in, and `amo` renews it itself. Either is
  kept in your system keyring.
- **A copy of your share of the CRM.** `sync` copies the pipelines, the deals assigned to you and only the contacts and
  companies on them. An administrator can choose colleagues too. No sync copies the whole CRM.
- **Staying current.** `amo work schedule command crm --every 1h -- sync` keeps the copy fresh with a timer.
- **Polite to amoCRM.** `amo` keeps to 5 requests a second for every `amo` process on the account, under amoCRM's
  limit, and waits out a short refusal.
- **No double writes.** When the answer to a write is lost, `amo` does not send it again. It reports the outcome as
  unknown, so you check the record first.
- **Made for scripts.** `--json` prints one JSON value, and every error has a code to branch on.

More: [command reference](docs/commands.md)

## Settings and permissions

Each profile has a permission level for every command and every API operation: `allow`, `ask`, `readonly` or `deny`.
Creating and changing deals, contacts and companies is allowed. Deletes and most other writes ask first. Messages to
clients, Salesbots, webhooks, writing tasks and giving a record to another user are denied until you allow them.

```sh
amo work config set permissions.deals.close deny   # this profile closes no deal
```

Over MCP nobody is there to answer, so `ask` lets the write go ahead. Set a key to `readonly` or `deny` to stop an
agent.

More: [settings and permissions](docs/configuration.md#permissions)

## Limits

- `amo` is tested against a fake account built from the Kommo API reference, not yet against a live account.
- amoCRM has no call that deletes a deal, so there is no `deals delete`.
- Without amoCRM's paid API filter add-on, `sync` reads a contact or company one request at a time, and a contact
  list cannot be narrowed by owner or time. A search by words still works.
- The Chats API, Drive and amoCRM's AI agent API live on other hosts, and `amo` does not reach them.
- Before 1.0, a minor version may change commands, `--json` fields and MCP tools. The changelog marks each such
  change.

## Security

The token works like a password: anyone who has it can do what its administrator can. `amo` keeps it in the system
keyring and never prints it. amoCRM has no call that revokes a token, so after a leak revoke it in the integration
itself.

More: [security](docs/security.md) · Report a vulnerability: [SECURITY.md](SECURITY.md)

## When something goes wrong

```sh
amo doctor                        # what is set up, without connecting
amo work session status --check   # whether the sign-in works, and as whom
```

More: [troubleshooting](docs/troubleshooting.md) · Ask on [Discord](https://discord.gg/DebENqbRrJ) · Bugs go to this
repository's issues.

## Documentation

Everything is on [wirecat.dev/en/docs/amo](https://wirecat.dev/en/docs/amo). The same pages are in
[docs/](docs/index.md).

## Development

```sh
pnpm install && pnpm test
```

Tests run against a fake account built from the Kommo API reference, with invented records and an injected keyring.
Nothing reaches a real account. `pnpm release:check` runs every check a release needs.

More: [testing](docs/dev/TESTING.md) · [design](docs/dev/DESIGN.md)

Pull requests, bug reports and ideas go to [issues](https://github.com/WireCatLabs/amo-cli/issues).

## Part of WireCat

`amo` is one of the [WireCat](https://wirecat.dev) tools: open-source, local-first command-line tools that give AI
agents your context from messengers, mail, calendars, documents and CRMs. Each one works on its own.

## License

[Apache 2.0](LICENSE)
