# Use it

Find a deal, move it or see what changed overnight with one short command, the same one your agent runs. The amoCRM
API speaks in pipeline and stage ids and field ids, and `amo` takes stage names and field labels instead.

Your agent answers which deals stand in a stage, how the funnel looks this month and which tasks are overdue. It moves
a deal, closes it with the reason or updates a client when you ask, and every morning it can send you a digest of what
changed.

Every command starts with a profile, the name you gave the account. `sync` copies your deals and their clients into the
WireCat local store on your computer, and most reads answer from there, also offline. This page assumes the profile is
signed in, as [install and connect](installation.md) shows.

**On this page:**

1. [The profile comes first](#the-profile-comes-first)
2. [Sign in](#sign-in)
3. [The first sync](#the-first-sync)
4. [Read your deals](#read-your-deals)
5. [Change a deal](#change-a-deal)
6. [Tasks and what changed](#tasks-and-what-changed)
7. [Call the API](#call-the-api)
8. [Output for scripts](#output-for-scripts)
9. [Agents](#agents)

## The profile comes first

A profile is a name you choose for one account. It is the first word of every command that uses an account:

```sh
amo work config show
```

`AMO_PROFILE=work` does the same for one shell session. No profile is ever assumed, not even the only one. A command
without one stops with exit code 2 and lists the profiles on this computer.

## Sign in

Make the account's private integration and sign the profile in as [install and connect](installation.md) shows, with
a token or through the integration in the browser. `amo work session status --check` shows the account and the user a
profile acts as.

## The first sync

`sync` copies the pipelines, the deals assigned to you and only the contacts and companies on them into the local
store. An administrator can choose colleagues whose deals it copies too, as [settings](configuration.md#which-deals-sync-copies)
shows. Commands such as `deals list` then read that copy offline:

```sh
amo work sync
amo work deals list status:open
```

Any other client is read live with `people` or `organizations`. Run `sync` again to bring the copy up to date: it
reads only what changed since the last one. A sync stopped by `--max-pages` goes on from there the next time. This
keeps the copy fresh with a timer:

```sh
amo work schedule command crm --every 1h -- sync
amo work store status            # how far each kind is, and how many are stored
amo work sync --rescan           # everything again, every id too
```

## Read your deals

```sh
amo work deals list stage:"Quote sent"
amo work deals show deal:12
amo work pipelines show Sales --since-time 30d
```

`deals list` takes field:value terms, such as `status:open` or `stage:"Quote sent"`, and `--format csv` for a
spreadsheet. `deals show` gives one deal with its stage, amount and the people on it. `pipelines show` draws the
pipeline as a board and a funnel: how many deals stand in each stage and their sum, how many reached it and went on,
and the share won.

Contacts and companies are read live from the account:

```sh
amo work people list "Anna"
amo work organizations show "Example LLC"
```

A contact on your own deals comes with its phones and e-mails. A user who is not an administrator sees the phones
and e-mails of at most 100 other contacts and companies a day, counted on this computer.

## Change a deal

```sh
amo work deals move deal:12 "Negotiation"
amo work deals close deal:12 lost --reason "Example: chose another supplier"
amo work deals update deal:12 --amount 18000 --dry-run
```

A stage is named by its name in the pipeline. `close` marks a deal won or lost the CRM's own way, with the reason.
`--field` sets one of the account's own fields by its label, as `amo work fields list deals` prints them. A contact's
job title is one of those fields too. Every change answers an `operation_id`, and `--dry-run` shows what it would do
and the permissions it checks, and sends nothing. amoCRM has no call that deletes a deal, so close it as lost
instead. Files on deals and contacts are not supported yet.

When the answer to a write is lost, the error says `outcome_unknown` and `amo` does not send it again. amoCRM may have
made the change, so run `sync`, look at the deal with `deals show`, and write again only if the change is not there.

## Tasks and what changed

Tasks, comments and calls are off by default. To copy them, turn on the activities setting with your account's
address in place of the example `example.amocrm.ru`:

```sh
amo work config set crm.amocrm:example.amocrm.ru.activities on
amo work sync
amo work activities list overdue:true
```

The next `sync` copies the tasks, comments and calls on your deals and their clients from the last 90 days. Those on
a colleague's deal are never stored, and a call keeps only its direction, never the phone number or the recording.

`changes list` shows what the syncs saw change: deals made, moved, won, lost and given another owner, tasks added and
done, contacts added. This schedule makes a morning digest of the last day:

```sh
amo work changes list "at>=1d"
amo work schedule command crm-digest --at 08:30 -- changes list --format report
```

The digest arrives as a desktop notice. With `--deliver-to` it also goes to a Telegram chat or a mailbox through your
own WireCat `tg` or `mail`, and `amo help schedule command` shows the route's form. The digest names deal titles,
amounts, contact names and task subjects, never a note's text, and it masks phone numbers and e-mail addresses.
Everyone who reads the route reads it.

## Call the API

`amo work api list` lists every operation of the amoCRM API v4, named `<HTTP verb> <path>`, with its permission key
and the reference page. `api call` sends one, the query and the body as JSON:

```sh
amo work api call "GET /api/v4/leads" --params '{"limit":5,"with":"loss_reason"}'
amo work api call "PATCH /api/v4/leads/42" --body '{"price":1000}' --dry-run
```

`--dry-run` shows every permission the call checks and sends nothing. Tasks and notes are written this way, once their
keys allow it. `api call` is never offered over MCP.

## Output for scripts

Every command except `mcp serve` on stdin and stdout takes `--json`, and prints one JSON value on stdout. Errors are
JSON on stderr, with a code to branch on. The [command reference](commands.md) lists the codes.

## Agents

`amo skill install` puts the tool's skill where Claude Code, Codex, Gemini CLI and OpenClaw look for it.
`amo skill install --for hermes` also adds that folder to Hermes Agent's own settings, so a bare `skill install`
leaves Hermes out. An agent with a skill runs the same commands as you.

An app with no terminal, such as Claude Desktop, or ChatGPT and Claude in the browser, connects to `amo` over MCP, as
[MCP](mcp.md) shows. Before it does, decide what it may change, as [permissions](permissions.md#agents-and-mcp)
shows: over MCP nobody is there to answer a question, so a write at `ask` goes ahead.
