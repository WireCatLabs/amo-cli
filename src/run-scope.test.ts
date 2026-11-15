import { Readable } from "node:stream"
import { neverAnswers, runScopeCases } from "@wirecat/cli-core/testing"
import { describe, it } from "vitest"
import { definition } from "./program.js"
import { FAKE_ORIGIN, FAKE_TOKEN, fakeAmo } from "./testing/fake-amo.js"
import { signedIn } from "./testing/harness.js"

const stdin = () => Object.assign(Readable.from([FAKE_TOKEN]), { isTTY: false })

describe("each remote command runs inside cli-core's run", () => {
  const cases = runScopeCases({
    definition: definition(),
    commands: {
      "session start": ["fresh", "session", "start", "--host", FAKE_ORIGIN],
      "session status": ["work", "session", "status", "--check"],
      "api call": ["work", "api", "call", "PATCH /api/v4/leads/301", "--body", '{"name":"Renamed"}', "--yes"],
    },
    skip: {
      "mcp serve": "listens until stopped",
      doctor:
        "cli-core's appDoctorCommand answers --online outside a run of its own; drop this once core runs it inside",
    },
    answering: () => ({ keyring: signedIn(), fetch: fakeAmo().fetch, stdin: stdin() }),
    silent: () => ({ keyring: signedIn(), fetch: neverAnswers, stdin: stdin() }),
  })
  for (const one of cases) it(one.name, () => one.run())
})
