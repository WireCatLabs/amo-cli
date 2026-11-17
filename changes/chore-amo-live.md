### Fixed

- A sign-in from `AMO_TOKEN` and `AMO_HOST` now finds its user: each command asks the account whose token it is, as
  `session start` does, so `deals list` and the other reads of the copy show that user's deals instead of none. The
  token is kept nowhere. Under `--offline` nobody is asked, and the reads show none.
