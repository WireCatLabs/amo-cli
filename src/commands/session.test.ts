import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { accountOrigin, decodeSignIn } from "../amo/account.js"
import { FAKE_ORIGIN, FAKE_TOKEN, fakeAmo } from "../testing/fake-amo.js"
import { amo } from "../testing/harness.js"

describe("accountOrigin", () => {
  it.each([
    ["https://example.amocrm.ru", "https://example.amocrm.ru"],
    ["example.kommo.com/", "https://example.kommo.com"],
    ["HTTPS://Example.AmoCRM.com", "https://example.amocrm.com"],
  ])("keeps %s as %s", (raw, origin) => {
    expect(accountOrigin(raw)).toBe(origin)
  })

  it.each([
    "http://example.amocrm.ru",
    "https://www.amocrm.ru",
    "https://example.amocrm.ru:8443",
    "https://user@example.amocrm.ru",
    "https://example.amocrm.ru/api/v4",
    "https://example.amocrm.ru/?x=1",
    "https://example.bitrix24.ru",
    "https://a.b.amocrm.ru",
    "not an address at all",
  ])("refuses %s", (raw) => {
    expect(() => accountOrigin(raw)).toThrow(
      expect.objectContaining({ details: expect.objectContaining({ reason: "account.malformed" }) }),
    )
  })

  it("refuses a saved entry amo did not write", () => {
    expect(() => decodeSignIn("plain-token")).toThrow(expect.objectContaining({ code: "configuration_error" }))
  })
})

describe("session start", () => {
  it("reads the token from stdin, checks it, and keeps it in the keyring with the address as given", async () => {
    const keyring = memoryKeyring()
    const account = fakeAmo()
    const ran = await amo(["work", "session", "start", "--host", `${FAKE_ORIGIN}/`, "--json"], {
      keyring,
      account,
      stdin: FAKE_TOKEN,
    })
    expect(ran.code).toBe(0)
    expect(ran.json().item).toMatchObject({
      profile: "work",
      state: "saved",
      kind: "token",
      verified: true,
      account: "wirecatfake.amocrm.ru",
      account_info: { id: "31000001", name: "WireCat Fake Account", subdomain: "wirecatfake" },
      user: { id: "7001", name: "Test Owner", admin: true, manager: true },
    })
    expect(ran.out).not.toContain(FAKE_TOKEN)
    expect(account.calls.map((one) => one.operation)).toEqual(["GET /api/v4/account", "GET /api/v4/users/{id}"])
    const saved = keyring.get("amo-cli", "token:work")
    expect(saved && decodeSignIn(saved)).toEqual({ origin: FAKE_ORIGIN, token: FAKE_TOKEN, userId: "7001" })
  })

  it("signs in a user who is no administrator, whose name and rights stay unknown", async () => {
    const ran = await amo(["work", "session", "start", "--host", FAKE_ORIGIN, "--json"], {
      keyring: memoryKeyring(),
      account: fakeAmo({ admin: false }),
      stdin: FAKE_TOKEN,
    })
    expect(ran.json().item).toMatchObject({ user: { id: "7001", name: null, admin: null, manager: null } })
  })

  it("keeps nothing when the account refuses the token, and never shows it", async () => {
    const keyring = memoryKeyring()
    const ran = await amo(["work", "session", "start", "--host", FAKE_ORIGIN, "--json"], {
      keyring,
      stdin: "wirecatfake0wrongtoken",
    })
    expect(ran.code).toBe(4)
    expect(ran.json()).toMatchObject({ error: { code: "authentication_error", reason: "session.expired" } })
    expect(ran.err).not.toContain("wirecatfake0wrongtoken")
    expect(keyring.get("amo-cli", "token:work")).toBeNull()
  })

  it("refuses an empty token, a bad address and --offline before any request", async () => {
    const account = fakeAmo()
    const empty = await amo(["work", "session", "start", "--host", FAKE_ORIGIN, "--json"], { account, stdin: " " })
    expect(empty.json()).toMatchObject({ error: { code: "validation_error" } })
    const bad = await amo(["work", "session", "start", "--host", "https://www.kommo.com", "--json"], {
      account,
      stdin: FAKE_TOKEN,
    })
    expect(bad.json()).toMatchObject({ error: { reason: "account.malformed" } })
    const offline = await amo(["work", "session", "start", "--host", FAKE_ORIGIN, "--offline", "--json"], {
      account,
      stdin: FAKE_TOKEN,
    })
    expect(offline.json()).toMatchObject({ error: { reason: "offline.refused" } })
    const storage = await amo(["work", "session", "start", "--host", FAKE_ORIGIN, "--credential-storage", "x"], {
      account,
      stdin: FAKE_TOKEN,
    })
    expect(storage.code).toBe(2)
    expect(account.calls).toEqual([])
  })

  it("refuses a second profile on the same account and user", async () => {
    const keyring = memoryKeyring()
    await amo(["work", "session", "start", "--host", FAKE_ORIGIN], { keyring, stdin: FAKE_TOKEN })
    const ran = await amo(["other", "session", "start", "--host", FAKE_ORIGIN, "--json"], {
      keyring,
      stdin: FAKE_TOKEN,
    })
    expect(ran.json()).toMatchObject({ error: { code: "conflict", reason: "session.duplicate" } })
  })

  it("keeps the token in a private file when asked", async () => {
    const ran = await amo(
      ["filed", "session", "start", "--host", FAKE_ORIGIN, "--credential-storage", "file", "--json"],
      { keyring: memoryKeyring(), stdin: FAKE_TOKEN },
    )
    expect(ran.json().item).toMatchObject({ stored_in: "file" })
    expect((await amo(["filed", "session", "end", "--json"])).json().item).toMatchObject({ ended: ["file"] })
  })
})

describe("session status, end and list", () => {
  it("shows where the token comes from and, with --check, whose it is", async () => {
    const plain = await amo(["work", "session", "status", "--json"])
    expect(plain.json().item).toEqual({
      profile: "work",
      state: "saved",
      kind: "token",
      token_from: "keyring",
      account: "wirecatfake.amocrm.ru",
      verified: false,
    })
    const checked = await amo(["work", "session", "status", "--check", "--json"])
    expect(checked.json().item).toMatchObject({
      verified: true,
      account: "wirecatfake.amocrm.ru",
      user: { id: "7001", admin: true },
    })
    expect(checked.out).not.toContain(FAKE_TOKEN)
  })

  it("takes AMO_TOKEN with AMO_HOST, and refuses AMO_TOKEN alone", async () => {
    const env = { AMO_TOKEN: FAKE_TOKEN, AMO_HOST: "wirecatfake.amocrm.ru" }
    const ran = await amo(["work", "session", "status", "--check", "--json"], { keyring: memoryKeyring(), env })
    expect(ran.json().item).toMatchObject({ token_from: "environment", verified: true })
    const alone = await amo(["work", "session", "status", "--json"], {
      keyring: memoryKeyring(),
      env: { AMO_TOKEN: FAKE_TOKEN },
    })
    expect(alone.json()).toMatchObject({ error: { code: "configuration_error", reason: "account.host-missing" } })
  })

  it("says missing for a profile that never signed in, and a check needs a sign-in", async () => {
    const ran = await amo(["work", "session", "status", "--check", "--json"], { keyring: memoryKeyring() })
    expect(ran.json().item).toMatchObject({ state: "missing", kind: null, account: null, verified: false })
    // Its own config folder: an earlier sign-in in this file left `work`'s host there, which makes the profile known.
    const call = await amo(["work", "api", "call", "GET /api/v4/account", "--json"], {
      keyring: memoryKeyring(),
      env: { AMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "config-")) },
    })
    expect(call.json()).toMatchObject({ error: { reason: "profile.unknown" } })
  })

  it("ends a sign-in on this computer, and lists the profiles with their accounts", async () => {
    const keyring = memoryKeyring()
    await amo(["work", "session", "start", "--host", FAKE_ORIGIN], { keyring, stdin: FAKE_TOKEN })
    const listed = await amo(["session", "list", "--json"], { keyring })
    expect(listed.json().items).toContainEqual({
      profile: "work",
      signed_in: true,
      token_from: "keyring",
      account: "wirecatfake.amocrm.ru",
    })
    const ended = await amo(["work", "session", "end", "--json"], { keyring })
    expect(ended.json().item).toMatchObject({ profile: "work", ended: ["keyring"] })
    expect(keyring.get("amo-cli", "token:work")).toBeNull()
  })
})
