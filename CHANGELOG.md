# Changelog

Notable changes to `@wirecat/amo-cli`. One section per version, newest first.

## 0.5.0 — 25.11.2026

### Added

- **`search all` finds deals and leads by the meaning of their notes, calls and tasks**, in other words or another
  language, with the note's excerpt in the hit. `amo work sync --embed` builds the index with a model already
  downloaded (`amo models download embeddinggemma`); until then `search all` says it searched by words only
  (`@wirecat/cli-core` 0.751.0).
- **`people show` and `organizations show` take the `person:<id>` and `organization:<id>` a deal gives.**
- **`sync --embed` and `search all` by meaning** (cli-core 0.751.0). With the `activities` setting on, `sync --embed`
  indexes the copied comments and tasks with a model already downloaded, and `search all` then finds deals by what
  they mean, in Russian or any language, not only by their words. The skill tells an agent to ask by meaning before
  it reads every note.

### Changed — may break callers

- **`synced[].saved` in the `sync` answer counts only rows that changed** (new, different, deleted or back again), so
  a sync with nothing new answers 0.
- **amo is built on cli-core 1.0 and cli-base 1.0.** After its first run the store is at version 74, and only tools
  on cli-core 1.0 open it: upgrade every WireCat CLI on this computer together. The migration keeps a rollback copy,
  and refuses to run when it cannot write one (`store migrate --no-backup` migrates anyway).
- **`sync --rescan` no longer lets a sync mark most of a kind deleted.** It only lists everything again. When the
  guard holds a pass, `sync --allow-deletions <count>` lets it mark at most that many records deleted. The flag is
  for the owner in a terminal; the MCP server does not offer it.
- **An MCP call that names a refused folder answers `permission_error`**, not `validation_error`.

### Fixed

- **A deal moved in the same second its stage-task rules were set opens its task.**
- `search all` lists a name one letter off the one that matched after it, and finds a Latin name typed in Cyrillic
  letters and a Russian name typed in Latin letters, each marked `match: corrected`.
- `people show` and `organizations show` take the `person:<id>` and `organization:<id>` a deal gives.

## 0.4.0 — 24.11.2026

### Changed — may break callers

- **`account remove` and the check against a second sign-in are cli-core's shared CRM ones** (`@wirecat/cli-core`
  0.722.0). The reasons stay `account-remove.account-shared` and `session.duplicate`, with the same details, and a
  dry run still warns. The refusal now says `amoCRM account <host>`.
- **`account remove --delete-data` refuses when amo cannot tell which account another profile holds**
  (`account-remove.account-unknown`, detail `profile`): a profile whose saved sign-in is unreadable and that
  `session start` never remembered. `--keep-data` still removes.
- **`session start` refuses a profile named `files` or `foreign-contacts`** (`profile.reserved`): every account
  shares those folders in the state folder.

### Fixed

- **The install guide quotes amoCRM's refusal for a user who is not an administrator.** The one-click sign-in shows
  that user's account too, and amoCRM refuses under «Разрешить»: «Первичная установка интеграции доступна только
  администраторам аккаунта». The guide said the sign-in listed only the accounts where one is an administrator.

## 0.3.0 — 23.11.2026

### Added

- **Sign in with one click: `amo <profile> session start --host https://<subdomain>.amocrm.ru --one-click`.** The
  browser opens a page on connect.wirecat.dev, a WireCat server in Russia that amoCRM can reach. The person
  chooses the account and clicks «Разрешить», and amoCRM creates a WireCat integration in it. Nobody copies an
  integration ID, a secret key or a token. amoCRM sends the integration's secret key to connect.wirecat.dev, and `amo`
  collects it once. `amo` exchanges the code only with the account `--host` names, and refuses one allowed in another
  account. It keeps and renews the sign-in like `--client-id`. amoCRM lets only an account administrator allow it
  ([amoCRM: the button](https://www.amocrm.ru/developers/content/oauth/button)). amoCRM accounts only for now; Kommo
  signs in with a token.
- **`amo setup` offers «Войти через amoCRM» first to an administrator,** with the token second. WireCat Desktop shows
  the link to open, and waits until access is allowed.
- **`amo setup` asks whether you are an account administrator.** An administrator creates the integration as before.
  A user who is not one gets the request to send an administrator for a long-lived token, a warning that the token
  carries the administrator's rights, and, once connected, how to sync their own deals rather than the administrator's.
  WireCat Desktop shows the same steps. The installation page has the same path under "If you are not an
  administrator".

### Fixed

- **The shared CRM help no longer mentions leads or Bitrix24's fields.** amoCRM has no separate leads: `changes list`,
  `search all` and the other shared commands now describe deals only.
- The setup and the installation page no longer say that anyone can sign in through the integration in the browser:
  amoCRM's guide says it offers that sign-in only on accounts where the person is an administrator
  ([amoCRM: step by step](https://www.amocrm.ru/developers/content/oauth/step-by-step)).

## 0.2.0 — 19.11.2026

### Added

- **`amo guide` lists scenarios for common tasks**, each as commands in order and why: the first sync and the pipeline
  board, keeping the copy up to date, and letting an agent change the CRM without surprises.
- The README opens with the WireCat banner, and the installation page says how WireCat Desktop connects `amo`.

## 0.1.1 — 18.11.2026

### Fixed

- Published from GitHub Actions with npm provenance, so WireCat Desktop installs it: Desktop refuses a built-in tool's
  release that its own repository's workflow did not build, and 0.1.0 was published from a computer.
- The user docs match bitrix24-cli's: MCP and permissions pages, a full start page, `amo <profile> setup` in the
  README's quick start, environment variables in the configuration page, and more troubleshooting rows.

## 0.1.0 — 17.11.2026

### Added

- Started from `@wirecat/cli-template` 0.24.0.
- A `host` profile setting and the WireCat Desktop setup flow for a long-lived token, in English, Russian and Spanish
  (`amo setup`, `src/setup/`); `session start` keeps `host` too.
- On cli-core 0.676.0: a profile reads offline only its own user's deals of a copy another profile on the same account
  made (the administrator's reads stay whole), `organizations create|update --email|--phone` write the company's own
  fields or refuse when the account has none, and `pipelines show --since-time|--until-time` answer a period funnel.
- On cli-core 0.681.0 and cli-base 0.106.0: `setup apply --dry-run` never opens the keyring, and a skill's parts are
  served beside it.
- On cli-core 0.683.0: `changes list` and the digest work on Node 22.16, a note shows once in `changes list`, and
  `config set crm.amocrm:<host>.self` is refused (only a signed-in sync sets the copy's user).
- With `config set crm.amocrm:<host>.activities on`, `sync` copies the tasks, comments and calls on your deals and
  their clients (90 days back at first); `activities list` lists them, `changes list` shows what changed, and
  `schedule command crm-digest --at 08:30 -- changes list --format report` sends a morning digest. A task deleted in
  amoCRM leaves the copy at the next sync. A call keeps no phone number or recording, and the digest prints no note
  text.
- `session start --host <address>` signs in to an amoCRM or Kommo account with a long-lived token, read hidden or from
  stdin and kept in the keyring with the address; `session status --check` shows the account and the user.
- `api list`, `api show` and `api call` reach every operation of the amoCRM API v4 reference, each with its own
  permission key, query parameters in `--params` and the body in `--body`. Own reads and lead, contact and company
  changes are allowed, other reads, writes and deletes ask; conversations, chats, Salesbots, webhooks, widgets,
  calls, adding users and task writes are denied until you allow them.
- Only the account's administrator deletes, sets a field to nothing, unlinks records or reads contacts, companies, notes
  and events through `api call`, whatever the permissions say.
- `sync` copies the deals assigned to you, and to colleagues an administrator chooses, with their pipelines, stage
  history and deletions, and only the contacts and companies on those deals. It narrows its reads with amoCRM's API
  filter add-on when the account has it.
- `deals list`, `show`, `create`, `update`, `move` and `close` work on the copy and write to amoCRM; `close lost`
  takes a loss reason by name. There is no `deals delete`: API v4 cannot delete a deal.
- `people`, `organizations` and `users` read the account live; contacts and companies can be created and changed.
  Someone who is not the administrator sees another user's client's phones and e-mails in at most 100 `show`s a day.
- `session start --client-id <id>` signs in through your own private integration with OAuth, and renews the access
  token itself. The integration's Redirect URI is `https://wirecat.dev/webhooks/apps/amo-callback`.
- `account remove` forgets a profile's sign-in and files; `--delete-data` also deletes the account's copy, and refuses
  while another profile reads the same account (`--dry-run` lists it all and warns).
- `schedule` runs `sync` on a timer.
- `sync` resumes inside a page when a run's request budget ends, and reads clients only by the ids its deals name.
  A colleague's client on none of your deals never enters the copy, and a record restored from amoCRM's trash comes
  back whatever order amoCRM lists the events in.

### Changed — may break callers

- **The MCP Registry entry asks which profiles to serve.** It started `mcp serve --profiles all`, so a client that
  installed the server from the registry reached every account on the computer without the owner choosing. Now
  `--profiles` is a required argument with the example `personal`: the client asks for one profile, a
  comma-separated list or `all`. Why: a CLI never picks an account for the owner
  ([WC-MCP-9](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/mcp.md#wc-mcp-9--a-server-serves-the-profiles-it-is-told-with-one-connection-for-each)). Watch for: a client set up from the old entry keeps `--profiles all` until it is set up again; a
  server added by hand or with `mcp config` does not change.

### Fixed

- A sign-in from `AMO_TOKEN` and `AMO_HOST` now finds its user: each command asks the account whose token it is, as
  `session start` does, so `deals list` and the other reads of the copy show that user's deals instead of none. The
  token is kept nowhere. Under `--offline` nobody is asked, and the reads show none.
