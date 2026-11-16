import { copyFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { neverAnswers, runScopeCases } from "@wirecat/cli-core/testing"
import { beforeAll, describe, expect, it } from "vitest"
import { definition } from "./program.js"
import { FAKE_ORIGIN, FAKE_TOKEN, fakeAmo } from "./testing/fake-amo.js"
import { signedIn, synced } from "./testing/harness.js"

// The writes name a stored deal, so each case gets its own copy of one synced store.
let seeded = ""
// The cases are built before the store is synced, so they name the ref the sync gives; beforeAll checks it.
const DEAL = "deal:1"
beforeAll(async () => {
  seeded = join(mkdtempSync(join(tmpdir(), "run-scope-seed-")), "store.db")
  process.env.MESSAGING_STORE = seeded
  const { ref } = await synced()
  expect(ref(301)).toBe(DEAL)
})

const options = (fetch: typeof globalThis.fetch) => {
  const store = join(mkdtempSync(join(tmpdir(), "run-scope-")), "store.db")
  copyFileSync(seeded, store)
  return {
    keyring: signedIn(),
    fetch,
    sleep: async () => {},
    env: { ...process.env, MESSAGING_STORE: store },
    stdin: Object.assign(Readable.from([FAKE_TOKEN]), { isTTY: false }),
  }
}

describe("each remote command runs inside cli-core's run", () => {
  const cases = runScopeCases({
    definition: definition(),
    commands: {
      "session start": ["fresh", "session", "start", "--host", FAKE_ORIGIN],
      "session status": ["work", "session", "status", "--check"],
      sync: ["work", "sync"],
      "deals create": ["work", "deals", "create", "--title", "WireCat test", "--pipeline", "Продажи"],
      "deals update": ["work", "deals", "update", DEAL, "--title", "Example renamed"],
      "deals move": ["work", "deals", "move", DEAL, "Переговоры"],
      "deals close": ["work", "deals", "close", DEAL, "lost"],
      "people list": ["work", "people", "list"],
      "people show": ["work", "people", "show", "401"],
      "people create": ["work", "people", "create", "--first-name", "Anna"],
      "people update": ["work", "people", "update", "401", "--last-name", "Example"],
      "organizations list": ["work", "organizations", "list"],
      "organizations show": ["work", "organizations", "show", "501"],
      "organizations create": ["work", "organizations", "create", "--name", "Example"],
      "organizations update": ["work", "organizations", "update", "501", "--name", "Example Ltd"],
      "users list": ["work", "users", "list"],
      "users show": ["work", "users", "show", "7001"],
      "api call": ["work", "api", "call", "PATCH /api/v4/leads/301", "--body", '{"name":"Renamed"}', "--yes"],
    },
    skip: {
      "mcp serve": "listens until stopped",
      "schedule run": "starts the schedule's entry as its own process; src/schedule.test.ts runs it against a fake one",
      "schedule exec": "the timer's entry, which starts a process; src/schedule.test.ts runs it against a fake one",
      setup: "asks its questions in a terminal; its check is the same checkedToken that session start runs here",
      "setup apply": "takes its answers as JSON on stdin; src/setup/flow.test.ts drives it against the fake",
      "setup run": "takes its answers as JSON on stdin; src/setup/flow.test.ts drives it against the fake",
      doctor:
        "cli-core's appDoctorCommand answers --online outside a run of its own; drop this once core runs it inside",
    },
    answering: () => options(fakeAmo({ perSecond: 10_000 }).fetch),
    silent: () => options(neverAnswers),
  })
  for (const one of cases) it(one.name, () => one.run())
})
