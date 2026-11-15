# Changelog

Notable changes to `@wirecat/amo-cli`. One section per version, newest first.

## Unreleased

### Added

- Started from `@wirecat/cli-template` 0.24.0.
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
  token itself.
