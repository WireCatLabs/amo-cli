# amo — design

What `amo` is built to, and why. The plan and its research are private (cli-private
`plans/2026-11-15-amo-cli/`); this page states the answers this repository is built to.

## Answers

- **Category:** CRM (sales: deals, contacts, companies)
- **Content languages:** ru, en
- **Sign-in:** a long-lived token now; OAuth through the owner's own private integration before the first release
- **The API:** official API documentation only: the amoCRM API v4, as the Kommo API reference describes it
- **How people filter:** by time, by person, by words in the text, by status or label
- **Never in the store, a log or the output:** tokens and passwords, links that carry a secret
- **Untrusted input:** names and titles set by others, links, messages from other people

## Reference CLI

[bitrix24-cli](https://github.com/WireCatLabs/bitrix24-cli) (`b24`). `amo` mirrors its command names, `--json`
answers, error reasons and file layout; every difference is listed under [What differs from b24](#what-differs-from-b24).

## Content languages

Languages: ru, en.

## Further answers

### Words

- The command is `amo`, with `wcat-amo` beside it; the package `@wirecat/amo-cli`; the keyring service and the config
  folder `amo-cli`; variables start with `AMO_`; the provider is `amocrm`.
- An amo lead is a cli-core **deal**: `amo` sets `leads: false` and has no `leads` commands, as acme-crm-cli. A contact
  is a `people` record and a company an `organizations` record.
- A pipeline's statuses are its stages. Status 142 is won and 143 lost in every pipeline; a status of `type` 1 is the
  pipeline's "Unsorted" stage, an open one
  ([leads_pipelines](https://www.amocrm.ru/developers/content/crm_platform/leads_pipelines)).
- An API operation is named `<HTTP verb> <path>`, as the reference does: `GET /api/v4/leads/{id}`.

### Sign-in

- `session start --host <address>` reads a long-lived token hidden or from stdin, checks it with
  `GET /api/v4/account` and `GET /api/v4/users/{id}`, and keeps one keyring entry, `amo-cli` / `token:<profile>`,
  through cli-core's `ProfileTokenStore`. The entry holds the token, the address and the user's id as JSON, so one
  entry is the whole sign-in, as b24's webhook address is.
- The address is kept exactly: `<subdomain>.amocrm.ru`, `<subdomain>.kommo.com` or `<subdomain>.amocrm.com`. amoCRM
  documents no redirect between them on account hosts, so `amo` never turns amocrm.com into kommo.com. `www.`, a
  port, a path and anything after the host are refused.
- `AMO_TOKEN` comes first, as `B24_TOKEN` does; it is only the token, so `AMO_HOST` names its account, and one without
  the other is a `configuration_error` (`account.host-missing`).
- The token goes in the `Authorization: Bearer` header only. No address carries it, so it is in no error, log or run
  record ([long-lived-token](https://developers.kommo.com/docs/long-lived-token)).
- Users can be read only by an administrator ([users-api](https://www.amocrm.ru/developers/content/crm_platform/users-api)):
  for anyone else, `session status --check` answers the user's name and `admin` as `null`, unknown, not false.
- OAuth comes in a later slice on cli-core's account-bound token codec: the owner's own private integration, the
  account host and the user id kept in the same entry, a rotated refresh token honoured, and a moved run writing only
  its temporary entry. A 401 on an OAuth access token is cli-core's `oauth.expired`, the reason `providerCall` refreshes
  on; a 401 on a long-lived token is `session.expired`, since nothing can renew it. `src/amo/call.ts` is a copy of
  cli-core's `providerCall` from its unreleased phase-1 branch, with the same options, until a release carries it.
- `session status` answers `account` as the host, a string, in every answer, and `account_info` (id, name, subdomain)
  with `--check`. `account` is cli-core's word for where a sign-in belongs (`AccountKey`); b24's `portal` should become
  `account` too. `user` has b24's `id`, `name`, `admin` and `manager`; amoCRM has no department head, so an
  administrator is the manager.

### Requests and limits

- Every request goes through cli-base `hostFetch`, allowed only the signed-in account's host. The manifest lists
  `*.amocrm.ru`, `*.amocrm.com` and `*.kommo.com`, and `userHosts` says the person chooses one of them.
- amoCRM allows 7 requests a second per integration and 50 per account
  ([recommendations](https://www.amocrm.ru/developers/content/api/recommendations)). cli-core's `Pacer` keeps every
  `amo` process on one account, whatever the profile, to 5 a second with no burst. A pace wait longer than 20 s, under
  the one-shot run's 30 s deadline, ends at once as `rate_limited` with `retry_after_ms`; a wait from 5 s says so.
- A read is tried again on a lost answer or a 5xx; any call on a 429, waiting `Retry-After`, then the body's
  `retry_after`, then a second; past 30 seconds the error carries `retry_after_ms` instead. A write that got no answer,
  or a 5xx, is `outcome_unknown` and never sent again: amoCRM documents no idempotency key.
- Refusals are problem+json ([error-codes](https://www.amocrm.ru/developers/content/crm_platform/error-codes)) and
  map to cli-base codes; `detail` is never repeated, since it can quote a value. 401 is `session.expired`; 402 is
  `amo.subscription-ended` (writes stop at once, reads 30 days later); a 403 with a JSON body is a rights refusal,
  `amo.access-denied`; 400 and 422 name the `validation-errors` paths; 404 is `not_found`; 204 is an empty list.
- A block of every request is a 403 too, `amo.blocked`, told by what the docs give: the ru
  [error-codes](https://www.amocrm.ru/developers/content/crm_platform/error-codes) page lists code 113 (access from
  this IP address is forbidden) and 403 (the account is blocked for repeatedly exceeding the requests a second), and
  Kommo's [http-codes](https://developers.kommo.com/docs/http-codes) page shows the block as a bare `403 Forbidden`.
  Neither names the body field, so `amo` reads `error_code` at the top or under `response`, and also takes any 403
  without JSON, and any 403 on `GET /api/v4/account`, which no user right gates, as a block. A block holds the
  account's pace for a minute, so other `amo` processes stop too.

### Permissions

- Each operation's key is `api.` with the path's words and the verb: `GET /api/v4/leads/{id}` is
  `api.leads.id.get`. A path the reference writes with `{entity_type}`, `{entity}` or `{bot}` is spelt out per value
  (`GET /api/v4/contacts/notes`), so `api.contacts=deny` covers a contact's notes and links too.
- Reads (NEED-2668 A): `allow` for what `amo`'s own commands and sync read: the account, leads, contacts, companies,
  pipelines and their statuses, the custom fields of those three, users, tasks, and the events list. Every other read
  asks: notes and events hold calls, SMS and chat text, unsorted holds what forms and mail brought in, and an event's
  detail is one of them.
- Writes (WC-PERM-22, as b24's CRM writes): creating and changing a lead, a contact or a company, `leads/complex`
  included, is `allow`; every other write and every delete asks.
- Denied until the owner allows them, reads too, as whole families: `talks`, `chats`, `contacts.chats`, `bots`,
  `salesbot`, `marketingbot`, `webhooks`, `widgets`, `website_buttons`, `calls`, `users.activate`,
  `users.deactivate`. They send messages, run automation, send account data to a URL, or switch users. A family's
  members carry no default of their own, so one `api.talks=allow` lifts all of it; set `api.talks=ask` to be asked.
- Denied one write at a time (NEED-2670 A, as b24's `user.add` and `tasks`): `POST /api/v4/users`, which gives a new
  person the whole account, every `tasks` write, which tells its assignee, and writes to `roles` and `sources`.
- `api call` also checks the command key the call does the same as: `deals.list`/`show`/`create`/`update`,
  `deals.move` for a write that sets `status_id` or `pipeline_id` and `deals.close` for status 142 or 143,
  `people.*`, `organizations.*`, all three creates for `leads/complex`, `<noun>.update` for a link or unlink,
  `pipelines.*`, `stages.list`, `users.*`, `fields.list`. It checks `crm.assign-others`, denied, when a write names a
  `responsible_user_id` other than the signed-in user, on a lead, contact, company or task, or on the contacts and
  companies nested in a complex lead. Those commands come with cli-core's CRM commands; their keys hold from now.
- Only the account's administrator, whatever the permissions (NEED-2669 A, b24's rule of 2026-11-10): a delete, an
  update that sets any field to nothing (`null`, `""`, `[]`, a field's `values: []`), and an unlink. amoCRM has no
  merge call. The check is in the transport, where every write passes, and asks `GET /api/v4/users/{id}`'s
  `rights.is_admin` only when a write falls under it; a refusal of that read means not an administrator
  ([users-api](https://www.amocrm.ru/developers/content/crm_platform/users-api)). A create may leave fields empty.
- Every write goes through cli-core's guard: the read-only lock, the levels, one question per key at `ask`, the send
  journal and an `operation_id`.

### The store and sync (next slices)

- Scope `mine`: a sync copies the deals whose responsible user is the signed-in user, plus colleagues the owner
  chooses, never the whole CRM (owner, 2026-11-15, NEED-2663), as b24.
- Pipelines and statuses first; leads with `with=contacts,loss_reason`; contacts' phones and e-mails split from their
  `multitext` fields; companies, users, custom fields. Changes by `filter[updated_at][from]` when the account's
  `is_api_filter_enabled` is on, else `order[updated_at]=desc` until the watermark; deletions from `*_deleted` events;
  stage history from `lead_status_changed` events.
- Shared `people`, `organizations` and `users` read the account live and refuse `--offline` (NEED-2661), as b24.
- **Another client's contact data keeps b24's rule** (owner, NEED-2660 A): a non-administrator sees at most 100 foreign
  contacts' or companies' `show`s a UTC day, contact data is stripped from their lists, and an administrator is exempt.
  The quota moves into cli-core; `amo` applies it through the source's `isAdmin?()` and `ownClients?()` hooks when the
  source lands (phase 4).
- The same rule holds for `api call` now: for anyone but the administrator it refuses a raw read of contacts and
  companies (their lists, records, notes and links, not their field definitions), of unsorted, and any read whose
  `with` embeds or names contacts or companies (`crm.client-reads-admin-only`, cli-core's reason, as b24's
  `readsClients`). A lead's own fields hold its contacts' ids only, so a plain lead read stays open.
- Unsorted (`/api/v4/leads/unsorted`) is not synced; a deal in a `type` 1 status is open in the stage "Unsorted".

### The fake account

`src/testing/fake-amo.ts` answers through `fetch`, from the operation table that `pnpm kommo:operations` generates out
of `contracts/kommo-openapi.json` (the Kommo reference pages, merged; `pnpm kommo:fetch` fetches them again from
`llms.txt`, a page a second). The same script writes `src/testing/kommo-schemas.ts`, each operation's query and body
schemas, which only the tests load. The fake refuses, with amoCRM's 400 `validation-errors`:

- a query parameter the operation does not declare, a value of the wrong type (`filter[updated_at][from]=yesterday`),
  a `with` value no page names, a `limit` past 250 (events 100);
- a body field the schema does not declare, a wrong type, a missing required field (an update without `id`), and a
  body where the operation takes none.

It refuses an unknown path or method (404), a wrong token (401), a request past 7 a second on a clock the test drives
(429 with `retry_after`), and answers an empty page with 204. Any operation it has no answer for is a 501, reads too:
a test that needs one adds it with `routes`, so no test passes on an empty account it did not ask for. A second
pipeline's `filter[statuses][1][…]` and the ru pages' repeated `filter[type][]` count as the spec's names. What amoCRM
documents and the merged spec lacks or gets wrong is in `src/amo/allow-list.ts`, each with its amocrm.ru page: the
mass links route, the `with` values of the account, leads, contacts, companies, users and events, the record types a
`{entity_type}` takes, the limits, and `custom_fields_values`, which every write page types as a string. A contract
test checks that every route in `src/amo/routes.ts`, the only names `amo`'s code may call, is in the table.

The seeded account is synthetic: two pipelines with an unsorted, a regular, the won (142) and the lost (143) status
each, four leads, three contacts with `PHONE` and `EMAIL` multitext fields, two companies, two users.

### What differs from b24

| b24 | amo | Why |
| --- | --- | --- |
| `session start` reads a webhook address | reads a token, with `--host` for the account | amoCRM's token carries no address; one entry keeps both |
| `session status` answers `portal` | `account`, the host, and `account_info` on `--check` | cli-core's word (`AccountKey`); b24 should move to it |
| `api` methods are REST names (`crm.deal.list`) | `<HTTP verb> <path>` from the OpenAPI | amoCRM is a REST API; the reference names operations so |
| `api list` lists the methods b24 calls | lists every operation of the reference | Kommo supports only the methods in its reference |
| `api list` terms `scope:`, `effect:` | `family:`, `effect:` | amoCRM has no per-method scope |
| `api call --body` | `--params` and `--body` | as gcal-cli and drive-cli: amoCRM reads a GET's parameters from the query |
| employee rules: delete, clear, unbind, merge, `batch` | delete, clear, unlink | amoCRM has no merge or batch call |
| `leads`, `products` commands | none | amo has no lead entity; products later (low value) |
| `account` commands, `sync`, CRM commands | not yet | the next slices |

## Open

- The `deny-keys` contract (`pnpm contracts:check`) fails until phase 4 mounts cli-core's CRM commands: it needs a
  remote read with a permission key, and `deals list` is the first. The template's MCP deny test comes back with it.

## Open questions for the owner

- Does the account answer `filter[updated_at]` without the paid filtering add-on? The ru docs call it "Alpha"; the
  sync falls back to ordering by `updated_at` (RISK-2306). Answered by the first live check.
- The Kommo reference is Kommo's and the account may be amoCRM's: a ru-only difference would pass the fake and fail
  live (RISK-2308). The first live check is the owner's.
