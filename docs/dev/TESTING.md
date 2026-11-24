# Testing

How the tests run, and what they never touch. The rules are the handbook's
[Testing page](../../node_modules/@wirecat/cli-base/docs/standards/testing.md).

- `pnpm test` runs vitest. `@wirecat/cli-base/testing/setup` gives each test file its own temporary home folder, a
  keyring that throws and no network, and points this CLI's config, state, cache and the shared store into that
  folder. `src/testing/sandbox.ts` names the config folder, which tests write into by name.
- `pnpm test:coverage` adds the coverage floor in `vitest.config.ts`.
- A script that starts the built bin runs it through `scripts/sandboxed.ts`, as `lint:commands` and the smoke tests
  do: a temporary home folder, its `XDG_*` folders, no `AMO_*` overrides and the keyring out of reach. A run
  that sees your home can move your real folders.
- `pnpm test:slow` lists the 20 slowest tests and the 10 slowest files. No test waits for real time (`WC-TEST-5`):
  waits go through an injected sleep, and `fakeClock()` from `@wirecat/cli-base/testing` records them.
- Each run logs the command lines the tests drove (`coverage/argv.jsonl`). `pnpm test:matrix` turns that log into
  [test-matrix.md](test-matrix.md); a command or option no test drives needs a reason in
  `scripts/test-matrix-untested.ts`.
- `pnpm contracts:check` runs the built CLI against `contracts/plan.json`: help, discovery, errors and the MCP tool
  list. `pnpm exec cli-contract contracts/plan.json --update` rewrites the snapshots; review the diff.
- `src/mcp.test.ts` pins `contracts/mcp-catalogue.json`: this CLI's own commands an agent can find over MCP, each a
  read or a write, from cli-core's `ownCatalogue`. What cli-core mounts is left out, since cli-core pins it, so a
  cli-core release does not rewrite the file. Pin a shared command here only when this CLI changes it on purpose.
- `pnpm contracts:upgrade` does not exist yet, and `.github/workflows/ci.yml` skips the step. It needs both local
  state of the CLI's own (a store, a sync cursor, any other file its code writes and reads back) and a published
  version to upgrade from; the skeleton has neither, and the config file and run records are cli-core's
  ([WC-TEST-14](../../node_modules/@wirecat/cli-base/docs/standards/testing.md)). Once the CLI keeps such state and its
  first version is on npm, add `contracts/upgrade.json` with `"previous": {}`: `cli-contract` then installs the newest
  published version at or below this one by itself
  ([cli-testing's contracts guide](https://github.com/WireCatLabs/cli-testing/blob/main/docs/ci/CONTRACTS.md)), so no
  version is kept by hand. Seed the state with the previous version's public commands only, never by importing its
  internal modules, which move from one release to the next. Then add the script, which runs
  `cli-contract contracts/upgrade.json`, and remove the skip.
- `pnpm smoke` installs the packed package into a temporary folder and runs it offline.
- `pnpm audit:commands` audits the command tree beside the latest published WireCat CLIs.

## Live check

`bin/release` publishes only a commit that ran against a real amoCRM account
([WC-REL-17](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/releases.md)): `pnpm exec cli-dev live
check` looks for its line in `docs/dev/live-checks.txt`. The owner runs `bin/amo-live`:

- Store the long-lived token once:
  `secret-tool store --label="amo <account>" service amo account <account>`. It asks for the token.
- `bin/amo-live <account> --host https://example.amocrm.ru` builds this checkout and reads only: sign-in, `doctor`,
  two syncs, pipelines, stages, deals, people, organizations, users, changes, CSV and search. It also logs the
  answers to the [live questions](DESIGN.md#open-questions-for-the-owner): `filter[updated_at]` on leads, tasks and
  notes, the order of events, which event types each `filter[type]` form returns, and a by-id read of a deleted lead.
  The run fails if the form the sync sends for this address returns other event types.
- `--write` also creates one deal "WireCat test …", renames it, moves it and closes it as lost. The API v4 cannot
  delete a lead, so the deal stays in the account, closed. The script then syncs again, reads the deal by its id to
  check it is closed, and searches the account for any open test deal. When every step passed, it runs
  `cli-dev live record`. Commit the new line of `live-checks.txt` in the release pull request.
- `AMO_NONADMIN_ACCOUNT=<account2>` also signs in with a non-administrator's token. It checks that this user's copy
  holds only their own deals, and that `users show` gets a clear refusal (403).

Each run gets a throwaway folder for config, state and a store per profile, so the real store is never opened. The
CLI cannot reach the keyring (`DBUS_SESSION_BUS_ADDRESS=disabled:`). The token goes in on stdin to
`session start --credential-storage file`, inside that folder, the way a person signs in. The script sets no
owner-only setting, so it also runs inside an agent's terminal. The log is kept in `~/.cache/amo-live/<time>.log`. It holds refs, ids, stage names, statuses and counts,
but never a client's name or the token.

## One-click sign-in by hand

The button sign-in needs a person in a browser, so `bin/amo-live` cannot run it. `bin/one-click-live
https://example.amocrm.ru` builds this checkout, opens the sign-in in a private Firefox window (no amoCRM sign-in
there, so amoCRM asks who signs in), checks the session and ends it, all in throwaway folders. The owner's steps,
including the test as a user who is not an administrator: [one-click-test.ru.md](one-click-test.ru.md).

## The bundle a user installs

`pnpm build` compiles `src/` with `tsc`, then cli-base's `cli-dev bundle`
([WC-LAY-10](https://github.com/WireCatLabs/cli-base/blob/main/docs/standards/layout.md))
bundles `dist/bin/amo.js` into `dist/bundle/` and makes the bin a loader. The vitest suite runs
against `src/`, so `scripts/smoke-bundle.ts` is the proof the bundle works: `pnpm smoke:node` runs it
under Node and `pnpm smoke:bun` under Bun, both in CI.
