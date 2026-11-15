import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Pacer } from "@wirecat/cli-core/sends"
import { describe, expect, it } from "vitest"
import { FAKE_ORIGIN, FAKE_TOKEN, type FakeAmoOptions, fakeAmo } from "../testing/fake-amo.js"
import { amoError } from "./errors.js"
import { matchOperation } from "./operation.js"
import { AmoTransport, type AmoTransportOptions } from "./transport.js"

const at = matchOperation

/** A clock only the waits move, so the fake's rate and the pace see the same time and no test really waits. */
const transport = (
  options: FakeAmoOptions = {},
  token = FAKE_TOKEN,
  origin = FAKE_ORIGIN,
  more: Partial<AmoTransportOptions> = {},
) => {
  let clock = 1_800_000_000_000
  const now = () => clock
  const account = fakeAmo({ now, ...options })
  const pacer = new Pacer(join(mkdtempSync(join(tmpdir(), "pace-")), "pace.json"), { perMinute: 300, burst: 1 }, now)
  const amo = new AmoTransport({
    signIn: { origin, token },
    fetch: account.fetch,
    pacer,
    now,
    sleep: async (ms) => {
      clock += ms
    },
    ...more,
  })
  return { amo, account, pacer, now }
}

describe("AmoTransport", () => {
  it("sends the token in the Authorization header only, and the query as the reference names it", async () => {
    const { amo, account } = transport()
    const answer = await amo.request({
      route: at("GET /api/v4/leads"),
      query: { "filter[id][]": [301, 302], limit: 1 },
    })
    expect((answer.body as { _embedded: { leads: unknown[] } })._embedded.leads).toHaveLength(1)
    const [call] = account.calls
    expect(call?.query).toEqual({ "filter[id][]": ["301", "302"], limit: ["1"] })
    expect(JSON.stringify(account.calls)).not.toContain(FAKE_TOKEN)
  })

  it("reads 204 as an empty list", async () => {
    const { amo } = transport({ routes: { "GET /api/v4/events": () => new Response(null, { status: 204 }) } })
    expect(await amo.request({ route: at("GET /api/v4/events") })).toEqual({ status: 204, body: undefined })
  })

  it("maps a refused OAuth access token to oauth.expired, and a long-lived one to session.expired", async () => {
    const oauth = transport({}, "wirecatfake0expired")
    const signedOauth = new AmoTransport({
      signIn: { origin: FAKE_ORIGIN, token: "wirecatfake0expired", oauth: true },
      fetch: oauth.account.fetch,
    })
    await expect(signedOauth.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({
      details: { reason: "oauth.expired" },
    })
    await expect(oauth.amo.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({
      details: { reason: "session.expired" },
    })
  })

  it("ends a pace wait past 20 s as rate_limited with the wait, nothing sent (FIND-14)", async () => {
    const { amo, account, pacer } = transport()
    await pacer.holdFor(25_000)
    await expect(amo.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({
      code: "rate_limited",
      details: { retry_after_ms: 25_000 },
    })
    expect(account.calls).toEqual([])
  })

  it("holds every process's pace after a block, so the next call is not sent", async () => {
    const blocked = transport({ blocked: true })
    await expect(blocked.amo.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({
      details: { reason: "amo.blocked" },
    })
    await expect(blocked.amo.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({
      code: "rate_limited",
    })
    expect(blocked.account.calls).toHaveLength(1)
  })

  it("lets only an administrator delete, blank a field or unlink, and asks the rights once (NEED-2669 A)", async () => {
    const employee = transport({ admin: false }, FAKE_TOKEN, FAKE_ORIGIN, {})
    for (const [route, body, rule] of [
      ["PATCH /api/v4/leads/{id}", { price: null }, "employee.clear"],
      ["DELETE /api/v4/leads/pipelines/{id}", undefined, "employee.delete"],
      ["POST /api/v4/leads/{entity_id}/unlink", [{ to_entity_id: 401, to_entity_type: "contacts" }], "employee.unbind"],
    ] as const)
      await expect(
        employee.amo.request({
          route: at(route),
          ids: route.includes("entity_id") ? { entity_id: 301 } : { id: 301 },
          body,
        }),
      ).rejects.toMatchObject({ code: "permission_error", details: { reason: rule, sent: false } })
    expect(employee.account.calls.map((one) => one.operation)).toEqual([
      "GET /api/v4/account",
      "GET /api/v4/users/{id}",
    ])
    const admin = transport()
    await expect(
      admin.amo.request({ route: at("DELETE /api/v4/leads/pipelines/{id}"), ids: { id: 5002 } }),
    ).rejects.toMatchObject({ details: { status: 501 } })
  })

  it("keeps the account's own host: a .amocrm.com account is reached there, never at kommo.com", async () => {
    const { amo, account } = transport({ host: "wirecatfake.amocrm.com" }, FAKE_TOKEN, "https://wirecatfake.amocrm.com")
    await amo.request({ route: at("GET /api/v4/account") })
    expect(account.calls).toHaveLength(1)
  })

  it("waits out a refused rate and tries again", async () => {
    const { amo, account } = transport({ perSecond: 1, retryAfter: 2 })
    await amo.request({ route: at("GET /api/v4/account") })
    await amo.request({ route: at("GET /api/v4/account") })
    expect(account.calls).toHaveLength(3)
  })

  it.each([
    [{ token: "wirecatfake0other" }, "authentication_error", "session.expired"],
    [{ unpaid: true }, "permission_error", "amo.subscription-ended"],
    [{ blocked: true }, "permission_error", "amo.blocked"],
    [{ admin: false, route: "GET /api/v4/users" }, "permission_error", "amo.access-denied"],
  ])("tells the refusals apart: %j", async (setup, code, reason) => {
    const { token, route, ...options } = setup as FakeAmoOptions & { token?: string; route?: string }
    const { amo } = transport(options, token ?? FAKE_TOKEN)
    const failure = amo.request({ route: at(route ?? "GET /api/v4/account") })
    await expect(failure).rejects.toMatchObject({ code, details: { reason } })
    await failure.catch((error: Error) => expect(error.message).not.toContain(token ?? FAKE_TOKEN))
  })

  it("answers a query the operation does not declare with the fields amoCRM names", async () => {
    const { amo } = transport()
    await expect(amo.request({ route: at("GET /api/v4/leads"), query: { "filter[nope]": 1 } })).rejects.toMatchObject({
      code: "validation_error",
      details: { fields: ["filter[nope]"] },
    })
    await expect(amo.request({ route: at("GET /api/v4/events"), query: { limit: 101 } })).rejects.toMatchObject({
      code: "validation_error",
    })
  })

  it("never sends a write twice: a lost answer is outcome_unknown, a server failure too", async () => {
    const lost = transport({ loseNextWrite: true })
    const sent = lost.amo.request({
      route: at("PATCH /api/v4/leads/{id}"),
      ids: { id: 301 },
      body: { name: "Renamed" },
    })
    await expect(sent).rejects.toMatchObject({ code: "outcome_unknown" })
    expect(lost.account.calls).toHaveLength(1)
    expect(lost.account.data.leads[0]?.name).toBe("Renamed")
    const failed = transport({ failWith: 502 })
    await expect(failed.amo.request({ route: at("POST /api/v4/leads"), body: [{ name: "x" }] })).rejects.toMatchObject({
      code: "outcome_unknown",
    })
    expect(failed.account.calls).toHaveLength(1)
  })

  it("tries a read again after a server failure", async () => {
    const { amo, account } = transport({ failWith: 503 })
    await expect(amo.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({
      code: "provider_unavailable",
    })
    expect(account.calls).toHaveLength(4)
  })

  it("refuses an id the route does not take", async () => {
    const { amo } = transport()
    await expect(amo.request({ route: at("GET /api/v4/leads/{id}"), ids: { id: ".." } })).rejects.toMatchObject({
      code: "validation_error",
    })
    await expect(amo.request({ route: at("GET /api/v4/leads"), ids: { id: "1" } })).rejects.toMatchObject({
      code: "validation_error",
    })
  })

  it("answers invalid_response to a success that is not JSON", async () => {
    const amo = new AmoTransport({
      signIn: { origin: FAKE_ORIGIN, token: FAKE_TOKEN },
      fetch: async () => new Response("<html></html>", { status: 200 }),
    })
    await expect(amo.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({ code: "invalid_response" })
  })

  it("answers a cut read as network_error, and a stopped one as cancelled", async () => {
    const cut = new AmoTransport({
      signIn: { origin: FAKE_ORIGIN, token: FAKE_TOKEN },
      sleep: async () => {},
      fetch: async () => {
        throw new TypeError("socket hang up")
      },
    })
    await expect(cut.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({ code: "network_error" })
    const stop = new AbortController()
    stop.abort()
    const stopped = new AmoTransport({
      signIn: { origin: FAKE_ORIGIN, token: FAKE_TOKEN },
      signal: stop.signal,
      fetch: async () => {
        throw new DOMException("aborted", "AbortError")
      },
    })
    await expect(stopped.request({ route: at("GET /api/v4/account") })).rejects.toMatchObject({ code: "cancelled" })
  })
})

describe("amoError", () => {
  it("keeps amoCRM's detail out of the message, and only code-shaped paths in fields", () => {
    const error = amoError(
      "PATCH /api/v4/leads",
      400,
      {
        title: "Bad Request",
        detail: "secret value 42",
        "validation-errors": [
          { errors: [{ code: "NotSupportedChoice", path: "0.price", detail: "x" }, { path: "a b" }] },
        ],
      },
      { json: true },
    )
    expect(error.message).not.toContain("secret")
    expect(error.details).toMatchObject({ fields: ["0.price"], provider_error: "NotSupportedChoice" })
  })

  it("asks for retry_after's wait, the header's first", () => {
    expect(amoError("x", 429, { retry_after: 3 }, { json: true }).details.retry_after_ms).toBe(3_000)
    expect(amoError("x", 429, { retry_after: 3 }, { json: true, waitMs: 500 }).details.retry_after_ms).toBe(500)
    expect(amoError("x", 429, undefined, { json: false }).details.retry_after_ms).toBe(1_000)
  })

  it.each([
    [404, "not_found"],
    [422, "validation_error"],
    [504, "provider_unavailable"],
    [302, "provider_error"],
  ])("maps HTTP %i to %s", (status, code) => {
    expect(amoError("x", status, {}, { json: true }).code).toBe(code)
  })
})
