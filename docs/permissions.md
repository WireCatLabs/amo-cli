# Permissions

Let an AI agent work in your CRM through `amo` and keep the say over what it changes. The token carries the rights of
the administrator who made it, so without your own limits an agent could do much of what that administrator can.

For each profile, the name you gave one account's sign-in, you decide what an agent may only read, what asks you first
and what goes ahead. You can stop an agent from moving or closing deals, and you know which checks hold whatever the
settings say.

Each command has a permission key, such as `deals.move`, and so does each operation of the amoCRM API. Each key has a
level: `allow`, `ask`, `readonly` or `deny`. You set the levels with `amo work config set`, and only you can loosen
one: an agent that tries is refused.

**On this page:**

1. [The levels](#the-levels)
2. [What a new profile allows](#what-a-new-profile-allows)
3. [API operations](#api-operations)
4. [Agents and MCP](#agents-and-mcp)
5. [Checks that hold whatever the permissions say](#checks-that-hold-whatever-the-permissions-say)

## The levels

- `allow` runs the command.
- `ask` asks you at a terminal before a write. In a script nobody is there to answer, so the write stops with exit 7
  unless the command has `--yes`. Over MCP the write goes ahead.
- `readonly` lets the key's reads run and refuses its writes.
- `deny` refuses the key, reads too.

```sh
amo work config set permissions.deals.close deny   # this profile closes no deal
amo work config show                               # each permission with its level and where it came from
```

A group key covers every key under it, and the longer key wins: `api.leads` covers every operation on deals, and
`api.leads.id.get` can still differ from it. `--dry-run` on a write shows every key it checks, with its level, and
sends nothing.

## What a new profile allows

- **Allowed:** what `amo`'s own commands read, such as deals, contacts, companies, pipelines, fields, users, tasks and
  events, and creating, changing, moving and closing deals, contacts and companies.
- **Asks first:** every other read, such as notes or unsorted, other writes, and every delete.
- **Denied, reads too:** conversations, chats, Salesbots, webhooks, widgets, website buttons, calls, and switching users
  on or off.
- **Denied writes:** adding users, and writing tasks, roles and lead sources. `crm.assign-others` is denied too, so no
  write gives a deal, a task or a contact to another user.

## API operations

An operation's key is the path's words and the verb: `GET /api/v4/leads/{id}` is `api.leads.id.get`.
`amo work api list` shows every operation with its key and level, and `amo work api show "PATCH /api/v4/leads"` one of
them.

`api call` also checks the key of the command that does the same thing, such as `deals.update` for
`PATCH /api/v4/leads`, so a raw call cannot get round a command's level. `api call` is never offered over MCP.

## Agents and MCP

Over MCP nobody is at a terminal to answer `ask`, so the write goes ahead. Moving and closing deals is `allow` for a
new profile anyway, and a stage change can start the account's own automation, such as a Salesbot that writes to a
client.

Before an agent gets the profile over MCP, choose one:

- Set `readonly` or `deny` for each write the agent must not make:

  ```sh
  amo work config set permissions.deals.move readonly
  amo work config set permissions.deals.close readonly
  ```

- Or keep the levels and turn on approval for the `amo_write` tool in your agent's client, so the client asks you
  before each write.

`mcp serve --permission deals.close=deny` and `mcp add … --permission …` make a level stricter for that one server.
They never loosen the profile. See [MCP](mcp.md).

## Checks that hold whatever the permissions say

- **`AMO_READ_ONLY=1`** refuses every write, for that shell or timer. An agent that `schedule agent` starts runs with
  it.
- **Only an administrator deletes or clears.** Unless the sign-in's user is an amoCRM administrator, `amo` refuses
  every delete, a write that sets a field to nothing and unlinking records (reason `employee.*`).
- **Contact, company, note, event and unsorted reads through `api call`** are an administrator's alone: they hold clients'
  phones and e-mails.
- **Phones and e-mails** of clients who are not on the user's own deals: at most 100 such contacts and companies a day
  through `people show` and `organizations show`, for a user who is not an administrator and their agents together.
  The count is kept on this computer: it stops an accident or an agent, not someone who means to take the base.
- **Whose deals a sync copies, and whether tasks and calls come with them** (`crm.amocrm:<address>.unassigned`,
  `activities`, `stage-tasks`): only you set them. An agent is refused.
- **amoCRM's own access rights.** The token acts as the user it belongs to, and amoCRM refuses what that user may not
  do (`amo.access-denied`).

Signed in through the integration in the browser instead of with a token, `amo` acts as the user who signed in, and
every rule above that names the sign-in's user applies to that user.

More: [settings](configuration.md), [security](security.md).
