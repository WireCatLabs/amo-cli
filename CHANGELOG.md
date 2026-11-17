# Changelog

Notable changes to `@wirecat/amo-cli`. One section per version, newest first.

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

### Fixed

- A sign-in from `AMO_TOKEN` and `AMO_HOST` now finds its user: each command asks the account whose token it is, as
  `session start` does, so `deals list` and the other reads of the copy show that user's deals instead of none. The
  token is kept nowhere. Under `--offline` nobody is asked, and the reads show none.
