### Added

- **WireCat Desktop reads amo's sign-in and MCP port from amo itself.** The manifest (`amo --wcat-describe`) now names
  the MCP server's port, 8761, and the sign-in Desktop runs: a long-lived token, typed on stdin. Built on
  `@wirecat/cli-base` 1.2.0.
