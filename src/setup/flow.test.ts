import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type KeyringStore, memoryKeyring } from "@wirecat/cli-base"
import { ProfileTokenStore, setupProblems } from "@wirecat/cli-core/cli"
import { setupFileProblems } from "@wirecat/cli-core/testing"
import { describe, expect, it } from "vitest"
import { encodeSignIn } from "../amo/account.js"
import { configuration } from "../config.js"
import { IDENTITY } from "../identity.js"
import { FAKE_HOST, FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID } from "../testing/fake-amo.js"
import { amo, FAKE_SIGN_IN } from "../testing/harness.js"
import { amoSetup } from "./flow.js"
import en from "./texts.en.json" with { type: "json" }
import es from "./texts.es.json" with { type: "json" }
import ru from "./texts.ru.json" with { type: "json" }

const configs = () => mkdtempSync(join(tmpdir(), "amo-setup-"))

const apply = async (
  answers: Record<string, unknown>,
  keyring: KeyringStore = memoryKeyring(),
  env = { AMO_CONFIG_DIR: configs() },
) => {
  const ran = await amo(["work", "setup", "run", "apply", "--json", "--answer-stdin"], {
    keyring,
    env,
    stdin: `${JSON.stringify(answers)}\n`,
  })
  // The harness joins stderr's writes with nothing between them, and the sign-in events come first.
  const error = () =>
    ran.err.includes('{"error"') ? JSON.parse(ran.err.slice(ran.err.lastIndexOf('{"error"'))).error : undefined
  return { ...ran, error, keyring, env }
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

  it("**saves a sign-in that session start reads**: the address and the token's user beside the token", async () => {
    const saved = await apply({ host: FAKE_ORIGIN, token: FAKE_TOKEN })
    expect([saved.code, saved.error()]).toEqual([0, undefined])
    expect(saved.json()).toMatchObject({ item: { outcome: "ok", saved: ["host"], secrets: ["token"] } })
    expect(saved.out).not.toContain(FAKE_TOKEN)
    expect(saved.out).not.toContain("keep")
    const status = await amo(["work", "session", "status", "--check", "--json"], {
      keyring: saved.keyring,
      env: saved.env,
    })
    expect(status.json()).toMatchObject({
      item: { state: "saved", kind: "token", account: FAKE_HOST, verified: true, user: { id: String(FAKE_USER_ID) } },
    })
    const shown = await amo(["work", "setup", "show", "--json"], { keyring: saved.keyring, env: saved.env })
    expect(shown.json()).toMatchObject({ item: { values: { host: FAKE_ORIGIN, token: { set: true } } } })
  })

  it("**refuses offline and a profile named as a command, as session start does**", async () => {
    const offline = await amo(["work", "setup", "run", "apply", "--offline", "--json", "--answer-stdin"], {
      keyring: memoryKeyring(),
      env: { AMO_CONFIG_DIR: configs() },
      stdin: `${JSON.stringify({ host: FAKE_ORIGIN, token: FAKE_TOKEN })}\n`,
    })
    expect(offline.code).not.toBe(0)
    expect(offline.err).toContain("offline")
    const named = await amo(["sync", "setup", "run", "apply", "--json", "--answer-stdin"], {
      keyring: memoryKeyring(),
      env: { AMO_CONFIG_DIR: configs() },
      stdin: `${JSON.stringify({ host: FAKE_ORIGIN, token: FAKE_TOKEN })}\n`,
    })
    expect(named.code).not.toBe(0)
  })

  it("**a token that cannot be saved leaves the integration's sign-in in place**", async () => {
    const inner = memoryKeyring({ "amo-cli:oauth:amocrm:work": "integration-entry" })
    const keyring: KeyringStore = {
      get: (service, account) => inner.get(service, account),
      set: (service, account, value) => {
        if (account === "token:work") throw new Error("keyring locked")
        inner.set(service, account, value)
      },
      delete: (service, account) => inner.delete(service, account),
    }
    const env = { AMO_CONFIG_DIR: configs() }
    writeFileSync(join(env.AMO_CONFIG_DIR, "credentials.json"), "not json")
    const failed = await apply({ host: FAKE_ORIGIN, token: FAKE_TOKEN }, keyring, env)
    expect(failed.code).not.toBe(0)
    expect(inner.get("amo-cli", "oauth:amocrm:work")).toBe("integration-entry")
  })

  it("**apply --dry-run stops at a bad address and saves nothing; apply saves as run apply does**", async () => {
    const env = { AMO_CONFIG_DIR: configs() }
    const keyring = memoryKeyring()
    const dry = await amo(["work", "setup", "apply", "--dry-run", "--json"], {
      keyring,
      env,
      stdin: JSON.stringify({ host: "https://www.amocrm.ru" }),
    })
    expect(dry.json()).toMatchObject({ item: { valid: false, at: "account", errors: [{ input: "host" }] } })
    const saved = await amo(["work", "setup", "apply", "--json"], {
      keyring,
      env,
      stdin: JSON.stringify({ host: FAKE_ORIGIN, token: FAKE_TOKEN }),
    })
    expect(saved.json()).toMatchObject({ item: { outcome: "ok", secrets: ["token"] } })
    expect(new ProfileTokenStore({ app: IDENTITY, env: {}, keyring }).signedIn("work")).toBe(true)
  })

  it("**session start keeps the address the flow shows** when the profile is edited", async () => {
    const env = { AMO_CONFIG_DIR: configs() }
    const keyring = memoryKeyring()
    const started = await amo(["work", "session", "start", "--host", FAKE_ORIGIN, "--json"], {
      keyring,
      env,
      stdin: FAKE_TOKEN,
    })
    expect(started.code).toBe(0)
    const shown = await amo(["work", "setup", "show", "--json"], { keyring, env })
    expect(shown.json()).toMatchObject({ item: { values: { host: FAKE_ORIGIN } } })
  })

  it("**editing the same account without a new token checks the kept one**", async () => {
    const { code, err } = await apply({ host: FAKE_ORIGIN }, memoryKeyring({ "amo-cli:token:work": FAKE_SIGN_IN }))
    expect(err).not.toContain("validation_error")
    expect(code).toBe(0)
  })
})
