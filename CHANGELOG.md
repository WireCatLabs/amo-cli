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
- Only the account's administrator deletes, sets a field to nothing, unlinks records or reads contacts and companies
  through `api call`, whatever the permissions say.
