<!-- Generated from the command tree by pnpm generate. Do not edit. -->

# Commands

Every command, option and exit code, generated from the program itself. For the same list as JSON, run
`amo commands --json`.

**The first word is the profile**, a name you choose: `amo personal config show`. `AMO_PROFILE`
does the same for a whole shell session. No profile is assumed: a command that uses an account stops without one and
lists the profiles on this computer.

## Options for every command

| Option | What it does |
|---|---|
| `-V, --version` | output the version number. |
| `-v, --verbose` | more detail in what is shown: -v ids, -vv everything we know. Default: `0`. |
| `--json` | machine-readable output: one JSON value on stdout; --json=id,text keeps only those fields. |
| `--jsonl` | machine-readable output: one JSON object per line, for streaming and jq. |
| `--quiet` | diagnostics off; a failure is still said. |
| `--trace` | the connection's own log lines on stderr — never content. |
| `--debug` | on a failure, its whole record — cause and stack — in place of the short line. |
| `--timeout <duration>` | give up on the whole command after this — 30s, 2m, 500ms. |
| `--offline` | answer from what was recorded and never connect; fails if nothing was. |
| `--no-input` | never prompt or open interactive login; piped input remains available. |
| `--max-input-bytes <bytes>` | maximum buffered input bytes (default: 16777216). |
| `--max-output-bytes <bytes>` | maximum machine output bytes (default: 4194304; 0 disables). |
| `--brief` | found items as reference, title, time, author and excerpt only. |
| `--full` | found items with their whole text and every provider field. |
| `--compact` | one line per item for an agent: reference first, text last, paging and next steps as # lines. |
| `--dry-run` | preview parsed arguments and permissions before running the action. |
| `--yes` | go ahead without the question an ask level puts before a write. |
| `--record` | keep this run even where the config says record false; record_input false leaves the typed words out. |
| `--no-record` | do not keep this run, even if it fails. |

## `amo commands`

every command by section; --json prints its contract, one path per call

### `amo commands info`

one command contract, or all schemas, error reasons and explicit overrides

```sh
amo commands info [path]
```

| Argument | | What it is |
|---|---|---|
| `path` | optional | one command path; without one, export schemas, error reasons and explicit overrides. |

**Example:** `amo commands info commands`

## `amo session`

keep this profile's Example Comments token in the OS keyring

### `amo session start`

sign this profile in: the Example Comments API token is asked hidden or read from stdin, never taken as an argument, checked against the service, and only then kept in the keyring, or in a private file

**Changes something on this computer only.**

```sh
amo session start [options]
```

| Option | What it does |
|---|---|
| `--credential-storage <storage>` | where the token is kept: keyring, which falls back to a private file by itself, or file. Default: `keyring`. |

**Example:** `amo personal session start`, `amo personal session start --credential-storage file`

### `amo session status`

show where this profile's token comes from: AMO_TOKEN, the keyring or a file, never the token; --check asks Example Comments whose token it is

```sh
amo session status [options]
```

| Option | What it does |
|---|---|
| `--check` | ask Example Comments whether the token still works, and whose it is. |

**Example:** `amo personal session status`, `amo personal session status --check --json`

### `amo session end`

forget this profile's token on this computer; the token itself stays valid in Example Comments

**Changes something on this computer only.**

```sh
amo session end
```

**Example:** `amo personal session end`

### `amo session list`

list the profiles on this computer and whether each has a token; picks none

```sh
amo session list
```

**Example:** `amo session list`, `amo session list --json`

## `amo comments`

read and write comments in Example Comments, the sample service

### `amo comments list`

list the comments in Example Comments, newest first

```sh
amo comments list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | how many to show. |
| `--page <n>` | which page, starting at 1. |
| `--all` | every row, no paging. |

**Returns:** comment — id, text, author, created_at; every field: amo commands info comments list

**Example:** `amo personal comments list`, `amo personal comments list author:u2 --json=id,text`

### `amo comments show`

show one comment in Example Comments

```sh
amo comments show <id>
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the comment's id, as list prints it. |

**Returns:** comment — id, text, author, created_at; every field: amo commands info comments show

**Example:** `amo personal comments show c1`, `amo personal comments show c1 --json`

### `amo comments create`

post a comment in Example Comments

**Changes something in the service.**

```sh
amo comments create [options]
```

| Option | What it does |
|---|---|
| `--text <text>` | the comment's text. |

**Example:** `amo personal comments create --text "Looks good to me"`, `amo personal comments create --text "Looks good to me" --dry-run`

### `amo comments update`

change the text of your comment in Example Comments

**Changes something in the service.**

```sh
amo comments update <id> [options]
```

| Argument | | What it is |
|---|---|---|
| `id` | required | the comment's id, as list prints it. |

| Option | What it does |
|---|---|
| `--text <text>` | the new text. |

**Example:** `amo personal comments update c1 --text "Looks good now"`

## `amo doctor`

the state this installation is in, without connecting unless --online

```sh
amo doctor [options]
```

| Option | What it does |
|---|---|
| `--online` | also connect once and read the account; sends nothing. |

**Example:** `amo doctor`, `amo doctor --json`

### `amo doctor reports`

problem reports

#### `amo doctor reports show`

what a problem report holds; writes nothing

```sh
amo doctor reports show
```

**Example:** `amo doctor reports show`

#### `amo doctor reports create`

write a problem report to a file, and say where to send it

**Changes something on this computer only.**

```sh
amo doctor reports create [options]
```

| Option | What it does |
|---|---|
| `--run <id>` | the run the report is about; the newest failed one if not given. |
| `--output <file>` | where to write it; a new file in this directory if not given. |

**Example:** `amo doctor reports create --output ./problem-report.json`

## `amo skill`

the instructions an agent is given for this tool

### `amo skill show`

print SKILL.md — `amo skill install` puts it where Claude Code, Codex, Gemini CLI and OpenClaw look for it, and where Hermes does on request; --for prints the copy already there

```sh
amo skill show [options]
```

| Option | What it does |
|---|---|
| `--for <agents>` | print the copy installed for these agents instead of this version's. One of: `claude`, `agents`. |

**Example:** `amo skill show`

### `amo skill install`

write SKILL.md to \~/.claude/skills/amo-cli/ (Claude Code) and \~/.agents/skills/amo-cli/ (Codex, Gemini CLI, OpenClaw); --for hermes also has Hermes read \~/.agents/skills, which changes Hermes's own settings, so all leaves it out

**Changes something on this computer only.**

```sh
amo skill install [options]
```

| Option | What it does |
|---|---|
| `--for <agents>` | which agents to install for. One of: `claude`, `agents`, `hermes`, `all`. Default: `all`. |

**Example:** `amo skill install --for agents`

### `amo skill status`

for each place `amo skill install` writes to, and for the copy Hermes reads: the path, the version installed there, and whether it is current, stale, missing or unversioned

```sh
amo skill status
```

**Example:** `amo skill status`, `amo skill status --json`

## `amo mcp`

serve this profile to an agent over MCP and set it up — `claude mcp add amo -- amo <profile> mcp serve`

### `amo mcp serve`

serve this profile to an agent over MCP, on stdin and stdout — `claude mcp add amo -- amo <profile> mcp serve`; `amo mcp serve --profiles a,b` or `--profiles all` serves those profiles from one server and each tool asks which

**Changes something in the service.**

```sh
amo mcp serve [options]
```

| Option | What it does |
|---|---|
| `--permission <key=level>` | make a permission stricter for this server only, like comments.create=deny; it never loosens the profile; repeat for more keys. |
| `--profiles <names\|all>` | serve several profiles from one server instead of one: names, comma-separated, or all for every profile. |
| `--http` | serve over HTTP on 127.0.0.1 for ChatGPT and Claude in the browser, behind your tunnel; the profile's permissions decide. |
| `--port <port>` | the local port for --http (default 8765). |
| `--public-url <url>` | the tunnel's https address the browser apps use, e.g. https://<name>.ts.net or https://<name>.ts.net/tg. |

**Example:** `amo personal mcp serve`, `amo mcp serve --profiles work,personal`, `amo personal mcp serve --http --public-url https://laptop.example.ts.net`

### `amo mcp revoke`

forget every login `mcp serve --http` gave a browser app, of this profile or of the server `--profiles` names; each app must log in again

**Changes something on this computer only.**

```sh
amo mcp revoke [options]
```

| Option | What it does |
|---|---|
| `--profiles <names\|all>` | serve several profiles from one server instead of one: names, comma-separated, or all for every profile. |

**Example:** `amo personal mcp revoke`, `amo mcp revoke --profiles all`

### `amo mcp server`

start, stop and check `mcp serve --http` in the background; status shows the login code for a browser app

#### `amo mcp server start`

start `mcp serve --http` apart from this shell and answer once it listens, with its login code

**Changes something on this computer only.**

```sh
amo mcp server start [options]
```

| Option | What it does |
|---|---|
| `--port <port>` | the local port (default 8765). |
| `--public-url <url>` | the tunnel's https address the browser apps use, e.g. https://<name>.ts.net or https://<name>.ts.net/tg. |
| `--permission <key=level>` | make a permission stricter for this server only; repeat for more keys. |
| `--profiles <names\|all>` | the server of several profiles that `mcp serve --profiles` serves: names, comma-separated, or all. |

**Example:** `amo personal mcp server start --public-url https://laptop.example.ts.net`

#### `amo mcp server stop`

stop `mcp serve --http` — only one that `mcp server start` started

**Changes something on this computer only.**

```sh
amo mcp server stop [options]
```

| Option | What it does |
|---|---|
| `--profiles <names\|all>` | the server of several profiles that `mcp serve --profiles` serves: names, comma-separated, or all. |

**Example:** `amo personal mcp server stop`

#### `amo mcp server status`

whether `mcp serve --http` runs, on which port and address, the login code for a new browser app, and the apps logged in

```sh
amo mcp server status [options]
```

| Option | What it does |
|---|---|
| `--profiles <names\|all>` | the server of several profiles that `mcp serve --profiles` serves: names, comma-separated, or all. |

**Example:** `amo personal mcp server status --json`

### `amo mcp config`

print the mcpServers entry for Claude Desktop, Cursor and others, with full paths; writes nothing

```sh
amo mcp config [options]
```

| Option | What it does |
|---|---|
| `--permission <key=level>` | make a permission stricter for this server only, like comments.create=deny; it never loosens the profile; repeat for more keys. |
| `--profiles <names\|all>` | serve several profiles from one server instead of one: names, comma-separated, or all for every profile. |

**Example:** `amo personal mcp config`, `amo mcp config --profiles all`

### `amo mcp add`

add this profile's local MCP server to Codex or Claude Code

**Changes something on this computer only.**

```sh
amo mcp add <client> [options]
```

| Argument | | What it is |
|---|---|---|
| `client` | required | codex or claude-code. |

| Option | What it does |
|---|---|
| `--allow-writes` | acknowledge that this profile offers writing tools. |
| `--permission <key=level>` | make a permission stricter for this server only, like comments.create=deny; it never loosens the profile; repeat for more keys. |

**Example:** `amo personal mcp add codex --allow-writes`

### `amo mcp check`

check this profile's local MCP handshake and tool list

```sh
amo mcp check [options]
```

| Option | What it does |
|---|---|
| `--permission <key=level>` | make a permission stricter for this server only, like comments.create=deny; it never loosens the profile; repeat for more keys. |

**Example:** `amo personal mcp check`

## `amo upgrade`

upgrade amo with the package manager that installed it; --check only looks

**Changes something on this computer only.**

```sh
amo upgrade [options]
```

| Option | What it does |
|---|---|
| `--check` | say whether a newer version exists, and install nothing. |

**Example:** `amo upgrade --check`

## `amo config`

the settings in force, and where each one came from

### `amo config show`

the profile, the profiles that exist, and each setting with where it came from

```sh
amo config show
```

**Example:** `amo personal config show`

### `amo config set`

save a setting to the configuration file

**Changes something on this computer only.**

```sh
amo config set <setting> <value> [options]
```

| Argument | | What it is |
|---|---|---|
| `setting` | required | one of: limit, timeout_ms, color, record, record_input, keep_runs_for_days, keep_successful_runs_for_days, keep_store_runs_for_days, runs_size_limit_mb, permissions, requests_per_minute, search_reranker, embedding_provider, embedding_model, embedding_base_url, embedding_dims, models, update_check, skill_hint, search_stemmers.cyrillic, search_stemmers.latin, owner_languages, crm.<provider>:<account>.links, crm.<provider>:<account>.company-types, crm.<provider>:<account>.scope, crm.<provider>:<account>.unassigned, crm.<provider>:<account>.self, crm.<provider>:<account>.stage-tasks, crm.<provider>:<account>.activities. |
| `value` | required | a number, true or false; for a group tg:work,max:Alice,email:me@x. |

| Option | What it does |
|---|---|
| `--defaults` | change what every profile gets, rather than this profile. |

**Example:** `amo personal config set limit 20`

### `amo config unset`

remove a setting from the configuration file

**Changes something on this computer only.**

```sh
amo config unset <setting> [options]
```

| Argument | | What it is |
|---|---|---|
| `setting` | required | one of: limit, timeout_ms, color, record, record_input, keep_runs_for_days, keep_successful_runs_for_days, keep_store_runs_for_days, runs_size_limit_mb, permissions, requests_per_minute, search_reranker, embedding_provider, embedding_model, embedding_base_url, embedding_dims, models, update_check, skill_hint, search_stemmers.cyrillic, search_stemmers.latin, owner_languages, crm.<provider>:<account>.links, crm.<provider>:<account>.company-types, crm.<provider>:<account>.scope, crm.<provider>:<account>.unassigned, crm.<provider>:<account>.self, crm.<provider>:<account>.stage-tasks, crm.<provider>:<account>.activities. |

| Option | What it does |
|---|---|
| `--defaults` | change what every profile gets, rather than this profile. |

**Example:** `amo personal config unset limit`

### `amo config migrate`

write each setting the file lacks at its default, keeping yours

**Changes something on this computer only.**

```sh
amo config migrate
```

**Example:** `amo config migrate`

### `amo config repair`

fix broken JSON syntax in the settings file — comments, a missing or extra comma, unquoted keys, single quotes, missing closing brackets at the end — keeping every value, with a backup beside it; refuses anything with more than one reading and changes nothing then

**Changes something on this computer only.**

```sh
amo config repair [options]
```

| Option | What it does |
|---|---|
| `--dry-run` | say what it would fix, and change nothing. |

**Example:** `amo config repair`, `amo config repair --dry-run`

## `amo runs`

recorded runs — what this tool did, and when

### `amo runs list`

recorded runs, newest first

```sh
amo runs list [query] [options]
```

| Argument | | What it is |
|---|---|---|
| `query` | optional | field:value terms that narrow the list — the fields are below. |

| Option | What it does |
|---|---|
| `--limit <n>` | how many to show. Default: `20`. |
| `--page <n>` | which page, starting at 1. Default: `1`. |

**Returns:** run — run_id, command, started_at, status, cli_version, profile, completed_at, requests, and 23 more; every field: amo commands info runs list

**Example:** `amo personal runs list --limit 10`

### `amo runs show`

one run: what it was, how it ended, and every event it logged

```sh
amo runs show <run-id> [options]
```

| Argument | | What it is |
|---|---|---|
| `run-id` | required | an id from `amo runs list`. |

| Option | What it does |
|---|---|
| `--problems` | only failed responses, warnings and crashes. |

**Returns:** run details — run_id, command, started_at, status, cli_version, directory, event_count, events, and 22 more; every field: amo commands info runs show

**Example:** `amo personal runs show run-101`

### `amo runs path`

the directory holding one run

```sh
amo runs path <run-id>
```

| Argument | | What it is |
|---|---|---|
| `run-id` | required | an id from `amo runs list`. |

**Returns:** run location — path; every field: amo commands info runs path

**Example:** `amo personal runs path run-101`

## Exit codes

Branch on the code, not on the text: the text can change, the code does not.

| Code | When |
|---|---|
| `0` | it worked |
| `2` | `validation_error` |
| `3` | `configuration_error` |
| `4` | `authentication_error` |
| `5` | `permission_error` |
| `6` | `not_found` |
| `7` | `confirmation_required` |
| `8` | `rate_limited` |
| `9` | `timeout` |
| `10` | `network_error` |
| `11` | `provider_error` |
| `12` | `provider_unavailable` |
| `13` | `invalid_response` |
| `14` | `outcome_unknown` |
| `15` | `conflict` |
| `130` | `cancelled` |
| `1` | anything else |
