# amo

Keep your amoCRM or Kommo deals within your AI agent's reach, and ask about them in plain words. The CRM keeps them in
the cloud, and amoCRM and Kommo have no MCP server of their own for that data. `amo` reads it through the account's
API and keeps a copy on your computer.

An agent with `amo` tells you which deals stand in each stage, what changed since yesterday and who a client is. It
moves a deal, closes it or updates a contact when you ask, as far as the permissions you set allow.

`amo` is a WireCat command-line tool, a program you or your agent run in a terminal. `sync` copies your deals and
their contacts and companies into the WireCat local store, the one file on your computer that the WireCat tools share.
`search all` then finds a deal beside your messages, notes and meetings from the other tools. You need one private
integration in amoCRM or Kommo, which an account administrator makes once.

**On this page:**

1. [Start](#start)
2. [Every page](#every-page)

## Start

[Install and connect](installation.md) takes you from nothing to a signed-in profile and the first sync. Then
[use it](usage.md) shows the everyday commands and how to give `amo` to an agent.

## Every page

1. [Install and connect](installation.md): install, make the integration, sign in.
2. [Use it](usage.md): deals, the funnel, tasks, the morning digest, agents.
3. [Commands](commands.md): every command, option and exit code.
4. [Settings](configuration.md): permissions, which deals sync copies, tasks and calls.
5. [When something goes wrong](troubleshooting.md): symptoms and what to do.
6. [Security](security.md): where the token is kept and what never reaches a log.

`amo` also has the commands every WireCat tool shares: `doctor`, `commands`, `config`, `skill`, `mcp`, `runs` and
`upgrade`.
