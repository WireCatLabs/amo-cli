# amo

Know where every deal stands and what changed overnight, without opening amoCRM or Kommo. `amo` gives the AI agent
you already use, such as Claude Code or Codex, a copy of your deals on your computer, so it answers from that copy,
even offline. It moves and closes deals for you too, as far as you allow.

Ask which deals are stuck in "Quote sent", what changed in the CRM since yesterday, or how the Sales pipeline did in
the last 30 days. The agent answers with the deal, its amount and its owner. amoCRM and Kommo have no MCP server of
their own for this data. An administrator of an amoCRM account signs in with one click. Kommo, and users who are not administrators, sign in
with a token from a private integration that an administrator makes once.

**On this page:**

1. [What you get](#what-you-get)
2. [Things a newcomer would not guess](#things-a-newcomer-would-not-guess)
3. [How it looks](#how-it-looks)
4. [Why amo](#why-amo)
5. [What it can do](#what-it-can-do)
6. [How it works](#how-it-works)
7. [Start in a few minutes](#start-in-a-few-minutes)
8. [Limits](#limits)
9. [Find a guide for your task](#find-a-guide-for-your-task)

## What you get

- **The answer, not the search.** Ask about a deal or a client in your own words. The agent finds the deal with its
  amount and owner, read from your computer, with no clicking through the CRM.
- **The funnel at a glance.** How many deals stand in each stage and their sum, how many reached it and went on, and
  the share won in a period.
- **Mornings that start with what changed.** Yesterday's new deals, wins, losses and moves arrive as a short digest at
  the time you choose, as a notice on your desktop, or in your Telegram or mailbox through WireCat's `tg` or `mail`.
- **Changes by asking.** "Move Example kitchen to Negotiation" is enough. The agent finds the stage by its name, and
  you can check which permissions a change needs before it is made.
- **Your CRM beside your chats.** One search finds a deal next to the messages, mail and meetings about it that the
  other WireCat tools keep on your computer.

## Things a newcomer would not guess

- **amoCRM has no leads apart from deals.** What its API calls a lead is a deal, so `amo` has `deals` and no `leads`.
- **The key is a token from a private integration.** An account administrator makes the integration once and
  generates its long-lived token, which acts with that administrator's rights. On an amoCRM account that is not
  marked technical, amoCRM first asks for a waiver of technical support, which cannot be taken back. Kommo asks for
  none. [Install and connect](installation.md#create-the-integration) shows each click.
- **`work` is a name you choose.** It names one account, and it is the first word of every command. No command picks
  an account for you.
- **The copy holds your deals, not the whole CRM.** A sync copies the deals assigned to you, or to the colleagues an
  administrator chooses, with the contacts and companies on them. Any other client is read from the account each
  time.
- **A deal cannot be deleted.** amoCRM's API v4 has no call for it. Close the deal as lost instead.
- **Over MCP, "ask" goes ahead.** MCP is the way apps such as Claude Desktop call a tool, and nobody sits at a
  terminal there to answer a question. Set the writes an agent must not make to read only or refuse before you
  connect it.
- **A stage change can start the account's own automation**, such as a Salesbot that writes to a client. Decide who
  may move a deal before an agent gets the profile.

## How it looks

```text
You:    What changed in the CRM since yesterday?
Agent:  (runs amo work changes list "at>=1d")
        · New deal "Example kitchen", 15 000 EUR, in Quote sent
        · "Example office" won, 8 200 EUR
        · Task "Call back about the quote" added on "Example kitchen"
You:    Move Example kitchen to Negotiation.
Agent:  (runs amo work deals move deal:12 "Negotiation")
        Done. "Example kitchen" (deal 12) is in Negotiation now.
```

## Why amo

- **A copy of your deals on your computer.** Of the tools on the
  [comparison](https://wirecat.dev/en/docs/amo/compare), no other documents reading your deals without the internet.
  The next sync takes only the changes.
- **A permission on every action.** Allow, ask, read only or refuse, for each command and each operation of the
  amoCRM API. Messages to clients, Salesbots and webhooks, and giving a deal to a colleague, are refused until you
  allow them.
- **Writes you can check first.** `--dry-run` sends nothing and shows which permissions the write needs. A write that
  lost its answer is never sent again on its own, so a dropped connection makes no second deal.
- **Polite to amoCRM.** `amo` keeps under amoCRM's limit of requests a second, and most answers need no request at
  all.
- **The token stays in your system keyring.** It never shows in output, errors or logs.
- **amoCRM and Kommo, as many accounts as you need.** Each account is a profile you name in the command.
- **Free and open source.** Apache 2.0.

Another tool fits better when an agent should set tasks and write notes by itself. `amo` writes those only through
`api call`, which you run yourself after you allow it.

## What it can do

- **Deals:** list them by stage, pipeline, owner or status, show one with its contacts and stage history, create,
  update, move, close as won or lost with the reason, and set the account's own fields by their label.
  [Use it](usage.md#read-your-deals)
- **The funnel:** each stage of a pipeline with its count and sum, how many went on, and the share won in a period.
  [Use it](usage.md#read-your-deals)
- **Contacts and companies:** find, read, create and update them, and export a list to a CSV file for a spreadsheet.
  The account's users can be read. [Use it](usage.md#read-your-deals)
- **Tasks, comments and calls** on your deals, once you turn them on, and a task on your computer each time a deal
  enters a stage you name. [Use it](usage.md#tasks-and-what-changed)
- **What changed:** deals made, moved, won, lost and given another owner, tasks added and done, and a digest on a
  schedule. [Use it](usage.md#tasks-and-what-changed)
- **Any operation of the amoCRM API v4**, with the same permission checks. [Use it](usage.md#call-the-api)

## How it works

- **A copy on your computer.** `sync` puts your deals and their clients into the WireCat local store, the one file on
  your computer that every WireCat tool shares. Lists, the funnel and search read it, also offline.
- **Sign-in with one click, a token or through the integration.** Each is kept in the system keyring, or in a private file on
  a computer without one. [Install and connect](installation.md)
- **Made for scripts and agents.** `--json` gives a JSON answer, and an error comes with a code to branch on.
  [MCP](mcp.md)
- **What is stored and what goes over the network.** [Security](security.md)

## Start in a few minutes

Paste this into your agent:

```text prompt
Install amo with npm install -g @wirecat/amo-cli. Help me run amo work setup to connect my amoCRM account, then sync and show my open deals.
```

Or run it yourself:

```sh
npm install -g @wirecat/amo-cli
amo skill install            # teaches Claude Code, Codex and Gemini CLI to use amo
amo work setup               # the account's address and the integration's token, step by step
amo work sync                # copy your deals and their clients
amo work deals list status:open
```

You need Node.js 22.16 or a later 22.x, or Node.js 24 or later. [Install and connect](installation.md)

## Limits

- Lists of contacts and companies filter by owner or time only with amoCRM's paid API filter add-on. A search by
  words works without it.
- Contacts, companies and users are read from the account each time, so they need the internet.
- Files on deals and contacts are not supported yet.
- The Chats API, Drive and amoCRM's AI agent API live on other hosts, and `amo` does not reach them.

## Find a guide for your task

| Task | Guide |
|---|---|
| Install and connect an account | [Install and connect](installation.md) |
| Read and change deals, tasks, the digest | [Use it](usage.md) |
| Connect an app that uses MCP | [MCP](mcp.md) |
| Decide what an agent may change | [Permissions](permissions.md) |
| Whose deals a sync copies, and other settings | [Settings](configuration.md) |
| An exact command or option | [Commands](commands.md) |
| Something does not work | [When something goes wrong](troubleshooting.md) |
| How amo differs from other amoCRM tools | [Comparison](https://wirecat.dev/en/docs/amo/compare) |
