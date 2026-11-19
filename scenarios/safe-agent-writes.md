---
title: Let an agent change the CRM without surprises
goal: Give an agent your CRM over MCP while the writes that reach clients or cannot be undone stay yours.
steps:
  - run: amo config set permissions.deals.move readonly
    why: a stage change can start the account's own automation, such as a Salesbot that writes to a client; over MCP ask does not ask, so ask stops nothing there
  - run: amo config set permissions.deals.close deny
    why: no agent marks a deal won or lost, whatever it is asked
  - run: amo mcp add claude-code --permission people.update=deny --allow-writes
    why: add this profile to Claude Code; this server also refuses contact changes, and --allow-writes acknowledges the writes it still offers
  - run: amo config show
    why: each permission with its level and where it came from
  - run: amo runs list
    why: what the agent ran, refused writes too
look:
  - the levels of deals.move, deals.close and people.update in config show
  - refused runs in runs list, and which command asked
---

At a terminal `ask` still asks before the write. Over MCP nobody is there to answer, so a write at `ask` goes ahead;
set `readonly` or `deny`, or turn on approval of `amo_write` in the agent client.
