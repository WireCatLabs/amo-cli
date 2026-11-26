### Fixed

- **A store another process holds is `store.busy`, not a crash** (`@wirecat/cli-core` 1.3.0). When a scheduled sync
  of one profile kept the write lock, a second run failed with SQLite's raw `database is locked` as a bug. It now
  answers `conflict` (exit 15) with the reason `store.busy`.
- The first help screen names `amo session list` (cli-core 1.3.0).
