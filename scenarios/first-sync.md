---
title: First sync and the pipeline board
goal: Copy your deals and their clients into the local store and see where each deal stands.
steps:
  - run: amo setup
    why: the account's address and the long-lived token from your private integration; both are checked against the account before anything is saved
  - run: amo session status --check
    why: the account and the user the token acts as, and whether that user is an administrator
  - run: amo sync
    why: copies the pipelines, the deals assigned to you and only the contacts and companies on them; the next sync takes only the changes
  - run: amo pipelines show Sales
    why: the pipeline as a board and a funnel, how many deals stand in each stage and how many reached it
  - run: amo deals list status:open
    why: the open deals with stage, amount and owner, from the store, offline too
look:
  - the user in session status, since a colleague's token copies their deals, not yours
  - warnings in the sync answer, such as a page the account refused
  - the stage where most deals wait
---

`Sales` stands for one of your pipelines; `amo <profile> pipelines list` names them. An administrator can copy
colleagues' deals too, by their user ids: `amo <profile> users list`, then the `unassigned` setting on the settings
page. No setting copies the whole CRM, and any other client is read live with `people` or `organizations`.
