import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { type KeyringStore, memoryKeyring } from "@wirecat/cli-base"
import { ProfileTokenStore, run, setupCommand, setupProblems } from "@wirecat/cli-core/cli"
import { setupFileProblems } from "@wirecat/cli-core/testing"
import { describe, expect, it } from "vitest"
import { encodeSignIn } from "../amo/account.js"
import { configuration } from "../config.js"
import { IDENTITY } from "../identity.js"
import { definition } from "../program.js"
import { FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID, fakeAmo } from "../testing/fake-amo.js"
import { FAKE_SIGN_IN } from "../testing/harness.js"
import { amoSetup } from "./flow.js"
import en from "./texts.en.json" with { type: "json" }
import es from "./texts.es.json" with { type: "json" }
import ru from "./texts.ru.json" with { type: "json" }

// Mounted here only: on cli-core 0.675.0 apply keeps the bare token, which amo's sign-in cannot read.
const apply = async (answers: Record<string, unknown>, keyring: KeyringStore = memoryKeyring()) => {
  const root = mkdtempSync(join(tmpdir(), "amo-setup-"))
  const out: string[] = []
  const err: string[] = []
  const program = definition()
  const code = await run(
    ["work", "setup", "run", "apply", "--json", "--answer-stdin"],
    { ...program, commands: () => [...program.commands(), setupCommand(amoSetup)] },
    {
      streams: { data: (text) => out.push(text), diagnostic: (text) => err.push(text) },
      tty: false,
      keyring,
      env: { ...process.env, AMO_CONFIG_DIR: join(root, "config"), AMO_STATE_DIR: join(root, "state") },
      stdin: Object.assign(Readable.from([`${JSON.stringify(answers)}\n`]), { isTTY: false }),
      fetch: fakeAmo().fetch,
    } as Parameters<typeof run>[2],
  )
  const error = () => JSON.parse(err.at(-1) ?? "{}").error
  return { code, out: out.join(""), err: err.join(""), error, keyring }
}

describe("the setup flow", () => {
  it("**is a valid v1 document** over amo's own settings, with no image files yet", () => {
    expect(setupProblems(amoSetup.document, { settings: configuration.allSettings, v1: true })).toEqual([])
    expect(setupFileProblems(amoSetup, new URL("../../", import.meta.url))).toEqual([])
  })

  it("**has every text in Russian and Spanish too**", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })

  it("**the host input refuses an address that is not an account's**, with the setting's own schema", async () => {
    const { code, error } = await apply({ host: "https://www.amocrm.ru", token: FAKE_TOKEN })
    expect(code).not.toBe(0)
    expect(error()).toMatchObject({ code: "validation_error" })
  })

  it("**a token the account refuses keeps nothing**", async () => {
    const keyring = memoryKeyring()
    const { code, error, out } = await apply({ host: FAKE_ORIGIN, token: "not-the-token" }, keyring)
    expect(code).not.toBe(0)
    expect(error()).toMatchObject({ code: "authentication_error" })
    expect(out).toBe("")
    expect(new ProfileTokenStore({ app: IDENTITY, env: {}, keyring }).signedIn("work")).toBe(false)
  })

  it("**a profile moved to another account without a new token is refused**, never sent the old token", async () => {
    const other = encodeSignIn({ origin: "https://other.amocrm.ru", token: FAKE_TOKEN, userId: String(FAKE_USER_ID) })
    const { code, error } = await apply({ host: FAKE_ORIGIN }, memoryKeyring({ "amo-cli:token:work": other }))
    expect(code).not.toBe(0)
    expect(error()).toMatchObject({ code: "validation_error", reason: "account.token-missing" })
  })

  it("**editing the same account without a new token checks the kept one**", async () => {
    const { code, err } = await apply({ host: FAKE_ORIGIN }, memoryKeyring({ "amo-cli:token:work": FAKE_SIGN_IN }))
    expect(err).not.toContain("validation_error")
    expect(code).toBe(0)
  })
})
