### Added

- **`search all` finds deals and leads by the meaning of their notes, calls and tasks**, in other words or another
  language, with the note's excerpt in the hit. `amo work sync --embed` builds the index with a model already
  downloaded (`amo models download embeddinggemma`); until then `search all` says it searched by words only
  (`@wirecat/cli-core` 0.751.0).
- **`people show` and `organizations show` take the `person:<id>` and `organization:<id>` a deal gives.**

### Changed — may break callers

- **`synced[].saved` in the `sync` answer counts only rows that changed** (new, different, deleted or back again), so
  a sync with nothing new answers 0.

### Fixed

- **A deal moved in the same second its stage-task rules were set opens its task.**
