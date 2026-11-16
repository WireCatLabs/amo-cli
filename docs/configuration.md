# Settings

Decide what your AI agent may do in your amoCRM or Kommo account before you hand it over. Read only, change deals but
never message a client, or ask you first: each profile keeps its own answer.

An agent then works inside the limits you set. It reads and moves deals where you allow it, and a write you denied
stops before any request reaches the account. The same settings decide which deals `sync` copies and whether tasks
and calls come with them.

Settings live in one file, `config.json`, in the folder `amo doctor` shows. Each profile has its own part, and
`defaults` apply to every profile. `amo work config show` lists each setting and where it came from: the file, a
variable or the default.

**On this page:**

1. [See and change a setting](#see-and-change-a-setting)
2. [Permissions](#permissions)
3. [Which deals sync copies](#which-deals-sync-copies)
4. [Tasks and calls](#tasks-and-calls)
5. [Run records](#run-records)

## See and change a setting

```sh
amo work config show
amo work config set limit 50
amo work config unset limit
```

## Permissions

`permissions` decides what a command may do for this profile: `allow`, `ask`, `readonly` or `deny`, per permission
key. Each command has a key, such as `deals.close`, and so does each operation of the amoCRM API. An operation's key is
the path's words and the verb: `GET /api/v4/leads/{id}` is `api.leads.id.get`, so `api.leads` covers every operation
on deals.

```sh
amo work config set permissions.deals.close deny
```

What a new profile allows:

- **Allowed:** what `amo`'s own commands read, such as deals, contacts, companies, pipelines, fields, users, tasks and
  events, and creating and changing deals, contacts and companies.
- **Asks first:** every other read, such as notes or unsorted, other writes, and every delete.
- **Denied, reads too:** conversations, chats, Salesbots, webhooks, widgets, website buttons, calls, and switching users
  on or off.
- **Denied writes:** adding users, and writing tasks, roles and lead sources. `crm.assign-others` is denied too, so no
  write gives a deal, a task or a contact to another user.

`api call` also checks the key of the command that does the same thing, such as `deals.update` for
`PATCH /api/v4/leads`, so a raw call cannot get round a command's level.

Some things only the account's administrator does through `amo`, whatever the permissions say: deleting, setting a
field to nothing, unlinking records, and reading contacts, companies, notes and events through `api call`.

Over MCP there is no one to ask, so `ask` lets the command run. Set a key to `readonly` or `deny` to stop an agent.
`amo work mcp serve --permission deals.close=deny` makes a key stricter for one server only, and never looser.
`AMO_READ_ONLY=1` refuses every write, whatever the permissions say.

## Which deals sync copies

By default `sync` copies the deals assigned to the signed-in user. An administrator can choose other users instead.
Find their ids with `amo work users list`, then list them with your own id among them, since the list replaces your
own. The command below uses the example address `example.amocrm.ru` and the example ids `7001` and `7002`. Put your
account's address and the ids you chose in their place:

```sh
amo work config set crm.amocrm:example.amocrm.ru.unassigned 7001,7002
amo work sync
```

You set this yourself at a terminal, since an agent's run is refused it. A user who is not an administrator can choose only themselves. No setting copies the whole CRM. Any other client is
read live with `people` or `organizations`.

## Tasks and calls

`crm.amocrm:<address>.activities` is off by default. Turned on, the next `sync` copies the tasks, comments and calls on
your deals and their clients from the last 90 days. [Tasks and what changed](usage.md#tasks-and-what-changed) shows the
command. Like the choice of deals, only you set it, at a terminal.

## Run records

A command that fails is kept as a run, for `amo runs list` and `runs show`. `api call` and `session status --check`
are kept when they succeed too, unless `record` is `false` (then only failures) or they ran with `--no-record`.
`record_input` decides whether a run keeps the words you typed. It is `true` unless you set it to `false`. Secrets are
masked either way, as [security](security.md) shows.
