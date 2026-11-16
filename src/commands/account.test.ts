import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-base"
import { rememberAccount } from "@wirecat/cli-core/cli"
import { describe, expect, it } from "vitest"
import { IDENTITY } from "../identity.js"
import { openAmoStore } from "../store.js"
import { FAKE_HOST, FAKE_ORIGIN, FAKE_TOKEN, fakeAmo } from "../testing/fake-amo.js"
import { amo, FAKE_SIGN_IN } from "../testing/harness.js"

const storedAccounts = async () => {
  const store = await openAmoStore(process.env)
  try {
    return (await store.accounts.accounts()).map((one) => `${one.provider}:${one.account}`)
  } finally {
    await store.close()
  }
}

const syncedWork = async () => {
  const keyring = memoryKeyring({ "amo-cli:token:work": FAKE_SIGN_IN })
  const account = fakeAmo({ perSecond: 10_000 })
  const started = await amo(["work", "session", "start", "--host", FAKE_ORIGIN], {
    account,
    keyring,
    stdin: FAKE_TOKEN,
  })
  expect(started.code).toBe(0)
  expect((await amo(["work", "sync", "--json"], { account, keyring })).code).toBe(0)
  const crm = join(process.env.AMO_STATE_DIR ?? "", "crm", "work")
  mkdirSync(crm, { recursive: true })
  writeFileSync(join(crm, "own-companies.json"), "[]")
  return { keyring, crm, account }
}

describe("account remove", () => {
  it("--dry-run lists the sign-in, the profile's files and the account's copy, and changes nothing", async () => {
    const { keyring, crm } = await syncedWork()
    const ran = await amo(["work", "account", "remove", "--delete-data", "--dry-run", "--json"], { keyring })
    expect(ran.code).toBe(0)
    const item = ran.json().item as { removed: { kind: string; target: string }[] }
    expect(item).toMatchObject({ profile: "work", data: "deleted", dry_run: true, revoked: null })
    expect(item).toMatchObject({ account: { provider: "amocrm", account: FAKE_HOST } })
    expect(item.removed).toEqual(
      expect.arrayContaining([
        { kind: "keyring", target: "token:work" },
        { kind: "file", target: crm },
        { kind: "store", target: `amocrm:${FAKE_HOST}` },
      ]),
    )
    expect(keyring.get("amo-cli", "token:work")).toBe(FAKE_SIGN_IN)
    expect(existsSync(crm)).toBe(true)
    expect(await storedAccounts()).toContain(`amocrm:${FAKE_HOST}`)
    expect(ran.out + ran.err).not.toContain(FAKE_TOKEN)
  })

  it("--delete-data forgets both kinds of sign-in and deletes the account's deals, contacts and companies", async () => {
    const { keyring, crm } = await syncedWork()
    keyring.set("amo-cli", "oauth:amocrm:work", "{}")
    const ran = await amo(["work", "account", "remove", "--delete-data", "--yes", "--json"], { keyring })
    expect([ran.code, ran.err]).toEqual([0, ""])
    expect(keyring.get("amo-cli", "token:work")).toBeNull()
    expect(keyring.get("amo-cli", "oauth:amocrm:work")).toBeNull()
    expect(existsSync(crm)).toBe(false)
    expect(await storedAccounts()).not.toContain(`amocrm:${FAKE_HOST}`)
  })

  it("--keep-data forgets the sign-in and leaves the copy searchable", async () => {
    const { keyring } = await syncedWork()
    const ran = await amo(["work", "account", "remove", "--keep-data", "--yes", "--json"], { keyring })
    expect(ran.json().item).toMatchObject({ data: "kept", dry_run: false })
    expect(keyring.get("amo-cli", "token:work")).toBeNull()
    expect(await storedAccounts()).toContain(`amocrm:${FAKE_HOST}`)
  })

  it("--delete-data refuses while another profile reads the same account; --keep-data still removes", async () => {
    const { keyring, account } = await syncedWork()
    const colleague = JSON.stringify({ origin: FAKE_ORIGIN, token: FAKE_TOKEN, userId: "7002" })
    keyring.set("amo-cli", "token:home", colleague)
    rememberAccount(IDENTITY, "home", `${FAKE_HOST}:7002`, process.env)
    const listed = await amo(["work", "account", "remove", "--delete-data", "--dry-run", "--json"], { keyring })
    expect(listed.code).toBe(0)
    expect(JSON.stringify(listed.json().item)).toContain(`amocrm:${FAKE_HOST}`)
    expect(listed.err).toContain("home also reads")
    const refused = await amo(["work", "account", "remove", "--delete-data", "--yes", "--json"], { keyring, account })
    expect(refused.json().error).toMatchObject({ code: "conflict", reason: "account-remove.account-shared" })
    expect(keyring.get("amo-cli", "token:work")).toBe(FAKE_SIGN_IN)
    expect((await amo(["work", "account", "remove", "--keep-data", "--yes", "--json"], { keyring })).code).toBe(0)
    expect(keyring.get("amo-cli", "token:home")).toBe(colleague)
  })
})
