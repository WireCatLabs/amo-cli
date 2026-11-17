# Security

Give an AI agent your CRM without handing over the token or your clients' phone numbers. The token acts with an
administrator's rights, so `amo` keeps it where no output, log or agent can read it.

Your agent works with your deals and never sees the token. Each run is recorded with secrets and phone numbers masked,
so you can check afterwards what an agent did.

The keyring, permissions, MCP and logs work the same in every WireCat tool, as the
[shared security page](https://wirecat.dev/en/docs/security) describes. `amo` adds what is its own: the amoCRM token,
the hosts it reaches, and the browser login over MCP.

**On this page:**

1. [The token and the account](#the-token-and-the-account)
2. [Clients' phones and e-mails](#clients-phones-and-e-mails)
3. [api call](#api-call)
4. [MCP in the browser](#mcp-in-the-browser)
5. [Run records](#run-records)
6. [Settings files](#settings-files)

## The token and the account

`amo` keeps its settings in `config.json` and its state in the folders `amo doctor` shows. `session start` keeps
the account's long-lived token and address in the OS keyring (service `amo-cli`, account `token:<profile>`), or in a
private file where no keyring works. A sign-in through the integration is kept in the same place (account
`oauth:amocrm:<profile>`): the integration's ID and secret key, the access token and the refresh token. The token
goes only into the request's Authorization header, never into an address, an answer, a run record or the send journal.
`amo` reaches only the account you signed in to, a host under `amocrm.ru`, `amocrm.com` or `kommo.com`, and never
follows a redirect. amoCRM has no call that revokes a token: after a leak, revoke it on the integration's
«Выданные доступы» tab (Kommo: Authorization), as [install and connect](installation.md#sign-out-and-revoke-access)
shows.

## Clients' phones and e-mails

A contact or company on your own deals comes with its phones and e-mails. A user who is not an administrator sees
those of at most 100 other contacts and companies a day, for the user and their agents together. The count is kept on
this computer: it stops an accident or an agent, not someone who means to take the base.

A call copied with the activities setting keeps only its direction, never the phone number or the recording. The
morning digest masks phone numbers and e-mail addresses, and never prints a note's text.

## api call

`api call` reaches any operation of the amoCRM API v4, so it carries more checks than a command. It checks the
operation's own permission key and the key of the command that does the same thing. A read of contacts, companies,
notes, events or unsorted is refused to anyone but an administrator, since those hold clients' phones and e-mails. A
link with an access token in an answer is removed before you see it. `api call` is never offered over MCP.

## MCP in the browser

`amo work mcp serve --http` listens on `127.0.0.1` only, for browser apps that reach it through your own
tunnel. Each app logs in with a one-time code, and the server keeps a hash of each login it gives, in the state
folder, readable by you only. `amo work mcp revoke` forgets every one of them.

## Run records

A run record keeps the command line as you typed it, so `amo runs show` tells you what was run. A secret is still
stored as `[redacted]`: an option named like a token or password, a password in a link, a long opaque string. A
phone number is replaced by `[redacted]` inside the word you typed, message text included: one written with its "+" and
country code, or 11 to 15 digits in a row, so a long id of that length is hidden as well. To keep none of the words
you type, run `amo work config set record_input false`.

A secret is also found by what it looks like, in a run record and in a kept error message: a token in a known
format (GitHub, OpenAI, Slack, AWS, Stripe, npm and the like), a `Bearer` credential, a random-looking string of 20 or
more characters, and a random-looking run of 20 or more lower-case hex characters, such as a hex key or a full commit
hash. The value after a secret name is hidden too, whether it follows `=`, `:` or a space: `password=`, `API_TOKEN=`,
`password hunter2`, `pin 1234`. Some secrets look like ordinary words and stay: a value of letters only after a
secret name and a space (`pin this message` stays), a hex key in upper case, a short commit hash or a UUID, a short
password typed without a secret name before it, and a secret inside a link or a file path unless it is in a known
format or after a secret name.

## Settings files

`config.json` is saved readable by you only (`0600`), and its folder is created for you only (`0700`). A file or
folder made by an older version may be open to other users of the computer: `amo doctor` lists each under
`files.problems` and prints the `chmod` that fixes it. Windows is not checked. Report a vulnerability as [SECURITY.md](https://github.com/WireCatLabs/amo-cli/blob/main/SECURITY.md)
says.
