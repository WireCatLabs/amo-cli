---
title: Keep the copy up to date
goal: Have the local store follow the account on its own, and search it beside your other WireCat tools.
steps:
  - run: amo schedule command crm --every 1h -- sync
    why: a timer on this computer that runs sync every hour; it reads only what changed
  - run: amo schedule list
    why: the schedule, when it runs next and how its last run went
  - run: amo store status
    why: how far each kind's sync is, how many records are stored and when it last ran
  - run: amo search all invoice
    why: stored deals beside your messages, notes and meetings from other WireCat tools
look:
  - a schedule whose last run failed
  - a kind in store status that is partial, which the next sync goes on with
---

`amo <profile> sync --rescan` reads everything again, every id too, when the copy looks wrong.
