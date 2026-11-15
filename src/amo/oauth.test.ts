import { readFileSync } from "node:fs"
import { memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_CODE,
  FAKE_ORIGIN,
  fakeAmo,
  TOKEN_FIELDS,
} from "../testing/fake-amo.js"
import { amo } from "../testing/harness.js"
import { RELAY_URL } from "./oauth.js"

/** Plays the browser and the relay page: the owner allows the integration and pastes back what amoCRM sent. */
const browser = () => {
  let opened: (url: URL) => void = () => {}
  const url = new Promise<URL>((resolve) => {
    opened = resolve
  })
  return {
    url,
    openBrowser: async (given: string) => opened(new URL(given)),
    answer: async () => `${RELAY_URL}?code=${FAKE_CODE}&state=${(await url).searchParams.get("state")}`,
  }
}

const SECRET = { AMO_AMOCRM_CLIENT_SECRET: FAKE_CLIENT_SECRET }

const signIn = async (account = fakeAmo({ perSecond: 10_000 }), env: NodeJS.ProcessEnv = SECRET) => {
  const keyring = memoryKeyring()
  const played = browser()
  const ran = await amo(["work", "session", "start", "--host", FAKE_ORIGIN, "--client-id", FAKE_CLIENT_ID, "--json"], {
    account,
    keyring,
    env,
    answer: played.answer,
    openBrowser: played.openBrowser,
  })
  return { ran, keyring, account, url: await played.url }
}

describe("signing in through the owner's integration", () => {
  it("authorizes at amocrm.ru with the relay page, exchanges the code on the account, and keeps the sign-in", async () => {
    const { ran, keyring, account, url } = await signIn()
    expect([ran.code, ran.err.includes(FAKE_CLIENT_SECRET)]).toEqual([0, false])
    expect(ran.json()).toMatchObject({ item: { profile: "work", state: "saved", kind: "app", verified: true } })
    expect(url.origin + url.pathname).toBe("https://www.amocrm.ru/oauth")
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: FAKE_CLIENT_ID,
      mode: "post_message",
      redirect_uri: RELAY_URL,
    })
    expect(account.calls.find((one) => one.path === "/oauth2/access_token")?.body).toMatchObject({
      grant_type: "authorization_code",
      code: FAKE_CODE,
      redirect_uri: RELAY_URL,
    })
    const status = await amo(["work", "session", "status", "--check", "--json"], { account, keyring })
    expect(status.json()).toMatchObject({ item: { kind: "app", verified: true } })
  })

  it("never refreshes a rotating sign-in in a run with moved folders, so the normal run's token survives", async () => {
    const { keyring, account } = await signIn()
    account.expireAccess()
    const ran = await amo(["work", "people", "list", "--json"], { account, keyring })
    expect(ran.json()).toMatchObject({ error: { reason: "oauth.moved-rotating" } })
    expect(account.calls.filter((one) => one.path === "/oauth2/access_token")).toHaveLength(1)
  })

  it("keeps nothing when amoCRM refuses the secret, and never shows it", async () => {
    const { ran, keyring, account } = await signIn(undefined, { AMO_AMOCRM_CLIENT_SECRET: "wrong0secret" })
    expect(ran.code).not.toBe(0)
    expect(JSON.parse(ran.err.trim().split("\n").at(-1) ?? "")).toMatchObject({ error: { reason: "oauth.expired" } })
    expect(ran.err).not.toContain("wrong0secret")
    const status = await amo(["work", "session", "status", "--json"], { account, keyring })
    expect(status.json()).toMatchObject({ item: { state: "missing" } })
  })

  it("sends only the token fields the Kommo reference names", () => {
    const spec = JSON.parse(readFileSync(new URL("../../contracts/kommo-openapi.json", import.meta.url), "utf8"))
    const body = spec.paths["/oauth2/access_token"].post.requestBody.content["application/json"].schema
    expect(Object.keys(body.properties).sort()).toEqual([...TOKEN_FIELDS].sort())
  })
})
