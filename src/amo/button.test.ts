import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_CODE, FAKE_HOST, FAKE_ORIGIN, fakeAmo } from "../testing/fake-amo.js"
import { allowed, browser, fakeClaim, routed } from "../testing/fake-connect.js"
import { amo } from "../testing/harness.js"
import { appProvider, appStorage, CONNECT_PAGE_URL, RELAY_URL } from "./oauth.js"

const START = ["work", "session", "start", "--host", FAKE_ORIGIN, "--one-click", "--json"]

const signIn = async ({
  claim = fakeClaim(["keys"]),
  played = allowed(),
  account = fakeAmo({ perSecond: 10_000 }),
  keyring = memoryKeyring(),
  argv = START,
  env,
}: {
  claim?: ReturnType<typeof fakeClaim>
  played?: ReturnType<typeof browser>
  account?: ReturnType<typeof fakeAmo>
  keyring?: ReturnType<typeof memoryKeyring>
  argv?: string[]
  env?: NodeJS.ProcessEnv
} = {}) => {
  const ran = await amo(argv, {
    account: { fetch: routed(claim, account, env?.AMO_CONNECT_URL) },
    keyring,
    openBrowser: played.openBrowser,
    ...(env ? { env } : {}),
  })
  const tokenCalls = account.calls.filter((one) => one.path === "/oauth2/access_token")
  const lastError = () => JSON.parse(ran.err.slice(ran.err.lastIndexOf('{"error"'))).error
  return { ran, claim, played, account, keyring, tokenCalls, lastError }
}

const noSecrets = (text: string) => {
  for (const secret of [FAKE_CLIENT_SECRET, FAKE_CODE, "wirecatfake0access", "wirecatfake0refresh"])
    expect(text).not.toContain(secret)
}

/** Every file a run left in a folder, as text: the run records and logs among them. */
const written = (dir: string | undefined): string =>
  dir && existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: "utf8" })
        .map((name) => join(dir, name))
        .filter((path) => statSync(path).isFile())
        .map((path) => readFileSync(path, "latin1"))
        .join("\n")
    : ""

describe("signing in with amoCRM's button", () => {
  it("opens the connect page with the state in the fragment, claims the keys once and keeps a renewable sign-in", async () => {
    const { ran, claim, played, account, keyring, tokenCalls } = await signIn()
    expect([ran.code, ran.json()]).toMatchObject([0, { item: { state: "saved", kind: "app", verified: true } }])
    const opened = played.opened[0]
    expect(`${opened?.origin}${opened?.pathname}`).toBe(CONNECT_PAGE_URL)
    expect(opened?.search).toBe("")
    const state = new URLSearchParams(opened?.hash.slice(1)).get("state") ?? ""
    expect(state).toMatch(/^\d{4,5}\.[\w-]{43,}$/)
    expect(claim.bodies).toEqual([{ state }])
    expect(tokenCalls[0]?.body).toMatchObject({
      client_id: FAKE_CLIENT_ID,
      grant_type: "authorization_code",
      code: FAKE_CODE,
      redirect_uri: RELAY_URL,
    })
    noSecrets(ran.out + ran.err)
    noSecrets(
      written(process.env.AMO_STATE_DIR && dirname(process.env.AMO_STATE_DIR)) + written(process.env.AMO_CONFIG_DIR),
    )

    const stored = appStorage(process.env, "work", keyring).read() as ReturnType<
      ReturnType<typeof appStorage>["read"]
    > & { redirectUri: string; browser: boolean }
    expect(stored).toMatchObject({
      client: { clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET },
      account: { host: FAKE_ORIGIN },
      redirectUri: RELAY_URL,
      browser: true,
    })
    // The refresh a normal run makes, with what was kept: the same request as for a --client-id sign-in.
    const client = { clientId: FAKE_CLIENT_ID, ...stored.client }
    const renewed = await appProvider(FAKE_ORIGIN, client, stored.redirectUri).exchange?.(
      { grant_type: "refresh_token", refresh_token: stored.tokens.refreshToken },
      { fetch: account.fetch, client, now: Date.now, signInCommand: "amo" },
    )
    expect(renewed?.accessToken).toMatch(/^wirecatfake0access/)
    const status = await amo(["work", "session", "status", "--check", "--json"], { account, keyring })
    expect(status.json()).toMatchObject({ item: { kind: "app", account: FAKE_HOST, verified: true } })
  })

  it("waits while the claim server has no keys yet, with no real wait", async () => {
    const started = Date.now()
    const { ran, claim } = await signIn({ claim: fakeClaim(["not_ready", "not_ready", "keys"]) })
    expect(ran.code).toBe(0)
    expect(claim.bodies).toHaveLength(3)
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it("gives up after a minute of not_ready and keeps nothing", async () => {
    const { ran, claim, keyring, tokenCalls, lastError } = await signIn({ claim: fakeClaim(["not_ready"]) })
    expect(ran.code).not.toBe(0)
    expect(lastError()).toMatchObject({ code: "timeout", reason: "oauth.timeout" })
    expect(claim.bodies.length).toBeGreaterThan(10)
    expect(tokenCalls).toHaveLength(0)
    expect(appStorage(process.env, "work", keyring).read()).toBeUndefined()
  })

  it("refuses a claim that fails, without quoting its answer", async () => {
    const { ran, lastError, tokenCalls } = await signIn({ claim: fakeClaim([500]) })
    expect(lastError()).toMatchObject({ code: "provider_unavailable", reason: "oauth.unavailable" })
    expect(tokenCalls).toHaveLength(0)
    noSecrets(ran.out + ran.err)
  })

  it("refuses access allowed in another account, before the keys or the code go anywhere", async () => {
    const { ran, claim, tokenCalls, lastError, keyring } = await signIn({ played: allowed("other.amocrm.ru") })
    expect(ran.code).not.toBe(0)
    expect(lastError()).toMatchObject({ code: "authentication_error", reason: "oauth.mismatch" })
    expect(lastError().message).toContain("--host https://other.amocrm.ru")
    expect([claim.bodies, tokenCalls]).toEqual([[], []])
    expect(appStorage(process.env, "work", keyring).read()).toBeUndefined()
  })

  it("refuses a redirect with no account named", async () => {
    const played = browser(async (send, state) => void (await send({ code: FAKE_CODE, state })))
    const { lastError, claim } = await signIn({ played })
    expect(lastError()).toMatchObject({ reason: "oauth.mismatch" })
    expect(claim.bodies).toEqual([])
  })

  it("turns away a redirect with another sign-in's state and goes on waiting for its own", async () => {
    const statuses: number[] = []
    const played = browser(async (send, state) => {
      statuses.push(await send({ code: "stolen0code", state: `${state.split(".")[0]}.other`, referer: FAKE_HOST }))
      statuses.push(await send({ code: FAKE_CODE, state, referer: FAKE_HOST }))
    })
    const { ran, tokenCalls } = await signIn({ played })
    expect(ran.code).toBe(0)
    expect(statuses).toEqual([400, 200])
    expect(tokenCalls.map((one) => (one.body as { code: string }).code)).toEqual([FAKE_CODE])
  })

  it("replaces an earlier integration's sign-in with the new integration's keys", async () => {
    const keyring = memoryKeyring()
    appStorage(process.env, "work", keyring).write(
      {
        tokens: { accessToken: "old", refreshToken: "old", expiresAt: 1, scopes: [] },
        client: { clientId: "old-client", clientSecret: "old0secret" },
        extra: { host: FAKE_ORIGIN, userId: "7001", redirectUri: RELAY_URL },
      },
      { signIn: true },
    )
    const { ran } = await signIn({ keyring })
    expect(ran.code).toBe(0)
    expect(appStorage(process.env, "work", keyring).read()?.client).toEqual({
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
    })
  })

  it("refuses Kommo before opening anything", async () => {
    const { lastError, played } = await signIn({
      argv: ["work", "session", "start", "--host", "https://example.kommo.com", "--one-click", "--json"],
    })
    expect(lastError()).toMatchObject({ code: "validation_error", reason: "oauth.browser-amocrm-only" })
    expect(played.opened).toEqual([])
  })

  it("takes the site from AMO_CONNECT_URL, https only", async () => {
    const env = { AMO_CONNECT_URL: "https://connect.example.test" }
    const { ran, played, claim } = await signIn({ env })
    expect(ran.code).toBe(0)
    expect(played.opened[0]?.href).toMatch(/^https:\/\/connect\.example\.test\/connect\/amo\.html#state=/)
    expect(claim.bodies).toHaveLength(1)
    const plain = await signIn({ env: { AMO_CONNECT_URL: "http://connect.example.test" } })
    expect(plain.lastError()).toMatchObject({ code: "configuration_error", reason: "connect.url-invalid" })
    expect(plain.played.opened).toEqual([])
  })

  it("refuses --one-click with --client-id", async () => {
    const { lastError } = await signIn({ argv: [...START, "--client-id", FAKE_CLIENT_ID] })
    expect(lastError()).toMatchObject({ code: "validation_error" })
  })
})
