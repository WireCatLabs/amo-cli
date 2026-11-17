# Settings

Change how `amo` works for one account, or for every account on this computer, with one command, and see where each
value came from. You change only the few that matter to you, and the rest keep their defaults.

You decide whose deals `sync` copies, whether tasks and calls come with them, which stages open a task on your
computer, and what an agent may do. Only you can loosen a permission or change what a sync copies: an agent that
tries is refused.

Settings live in one file, `config.json`, in the folder `amo doctor` shows. Each profile has its own part, and
`defaults` apply to every profile. `amo work config show` lists each setting and where it came from: the file, a
variable or the default.

**On this page:**

1. [See and change a setting](#see-and-change-a-setting)
2. [Permissions](#permissions)
3. [Which deals sync copies](#which-deals-sync-copies)
4. [Tasks and calls](#tasks-and-calls)
5. [A task when a deal enters a stage](#a-task-when-a-deal-enters-a-stage)
6. [Run records](#run-records)
7. [Variables](#variables)

## See and change a setting

```sh
amo work config show
amo work config set limit 50
amo work config unset limit
```

## Permissions

`permissions` decides what a command may do for this profile: `allow`, `ask`, `readonly` or `deny`, per permission
key. Over MCP `ask` does not ask: the write goes ahead. The keys, their built-in levels and how to keep an agent's
writes yours are on [Permissions](permissions.md).

```sh
amo work config set permissions.deals.close deny
```

## Which deals sync copies

By default `sync` copies the deals assigned to the signed-in user. An administrator can choose other users instead.
Find their ids with `amo work users list`, then list them with your own id among them, since the list replaces your
own. The command below uses the example address `example.amocrm.ru` and the example ids `7001` and `7002`. Put your
account's address and the ids you chose in their place:

```sh
amo work config set crm.amocrm:example.amocrm.ru.unassigned 7001,7002
amo work sync
```

Only you set this, since an agent's run is refused it. A user who is not an administrator can choose only
themselves. No setting copies the whole CRM. Any other client is read live with `people` or `organizations`.

## Tasks and calls

`crm.amocrm:<address>.activities` is off by default. Turned on, the next `sync` copies the tasks, comments and calls on
your deals and their clients from the last 90 days. [Tasks and what changed](usage.md#tasks-and-what-changed) shows the
command. Like the choice of deals, only you set it.

## A task when a deal enters a stage

`crm.amocrm:<address>.stage-tasks` names stages, and each deal that moves into one of them opens a task on this
computer, beside your other WireCat tasks. The sync that brings the move opens it, once per move: a task you dismiss
does not come back, and the next entry into the same stage opens a new one. A stage is named by its id, which
`amo work stages list --json` prints as `external_id`. The command below uses the example address
`example.amocrm.ru`. amoCRM's won stage is `142` in every pipeline, so this rule opens a task for a win in any of
them:

```sh
amo work config set crm.amocrm:example.amocrm.ru.stage-tasks \
  '{"142":{"title":"Send the closing papers","due_days":2}}'
amo work sync
```

`amo` reads the account's stage history, so a deal that passed through a stage between two syncs still gets that
stage's task. Moves made before the setting was first set open none. Only you set it. To stop,
`amo work config unset crm.amocrm:example.amocrm.ru.stage-tasks`.

## Run records

A command that fails is kept as a run, for `amo runs list` and `runs show`. `api call` and `session status --check`
are kept when they succeed too, unless `record` is `false` (then only failures) or they ran with `--no-record`.
`record_input` decides whether a run keeps the words you typed: `true` (the default), `false`, or `failed` for failed
runs only. Secrets are masked either way, as [security](security.md) shows.

## Variables

A variable set for one shell or one timer comes before the file:

- `AMO_PROFILE` names the profile, so a command can leave it out.
- `AMO_READ_ONLY=1` refuses every write, whatever the permissions say.
- `AMO_TOKEN` with `AMO_HOST` signs in with a long-lived token for that run only, without the keyring. `AMO_HOST` is
  the account's address, and `AMO_TOKEN` without it is an error.
- `AMO_AMOCRM_CLIENT_SECRET` gives the integration's secret key to `session start --client-id`.
- `AMO_CONFIG_DIR` and `AMO_STATE_DIR` move the settings and the state to other folders. A sign-in made with them is
  kept apart from your usual one.
