import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { ENTITY_TYPES, EXTRA_OPERATIONS, LIMITS, WITH_VALUES } from "../amo/allow-list.js"
import { OPERATIONS } from "../amo/operation.js"
import { FAKE_ORIGIN, FAKE_TOKEN, fakeAmo } from "./fake-amo.js"

const headers = { authorization: `Bearer ${FAKE_TOKEN}` }
const get = (account: ReturnType<typeof fakeAmo>, path: string, init: RequestInit = {}) =>
  account.fetch(`${FAKE_ORIGIN}${path}`, { headers, ...init })

describe("the fake account refuses what amoCRM refuses", () => {
  it("404s an unknown path or method, as problem+json", async () => {
    const account = fakeAmo()
    for (const [path, method] of [
      ["/api/v4/nowhere", "GET"],
      ["/api/v4/leads", "DELETE"],
      ["/api/v4/leads/abc", "GET"],
    ] as const) {
      const response = await get(account, path, { method })
      expect(response.status).toBe(404)
      expect(response.headers.get("content-type")).toBe("application/problem+json")
    }
  })

  it("400s a query parameter the operation does not declare, a with no page names, and a limit past the maximum", async () => {
    const account = fakeAmo({ perSecond: 100 })
    for (const path of [
      "/api/v4/leads?filter[id][0]=1",
      "/api/v4/account?with=everything",
      "/api/v4/tasks?with=contacts",
      "/api/v4/leads?limit=251",
      "/api/v4/events?limit=101",
      "/api/v4/leads?limit=0",
    ]) {
      const response = await get(account, path)
      expect([path, response.status]).toEqual([path, 400])
      expect(await response.json()).toMatchObject({ "validation-errors": [{ errors: [{ path: expect.any(String) }] }] })
    }
    expect((await get(account, "/api/v4/events?limit=100")).status).toBe(204)
    expect((await get(account, "/api/v4/leads?limit=250&with=contacts,loss_reason")).status).toBe(200)
  })

  it("401s a missing or wrong token, 429s past seven requests a second, then lets the next second through", async () => {
    let clock = 0
    const account = fakeAmo({ now: () => clock })
    expect((await account.fetch(`${FAKE_ORIGIN}/api/v4/account`)).status).toBe(401)
    for (let at = 0; at < 7; at++) expect((await get(account, "/api/v4/account")).status).toBe(200)
    const refused = await get(account, "/api/v4/account")
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ retry_after: 1 })
    clock += 1_001
    expect((await get(account, "/api/v4/account")).status).toBe(200)
  })

  it("answers an empty list with 204 and pages a long one with _links.next", async () => {
    const account = fakeAmo()
    expect((await get(account, "/api/v4/leads/notes")).status).toBe(204)
    const first = (await (await get(account, "/api/v4/leads?limit=2")).json()) as { _links: { next?: unknown } }
    expect(first._links.next).toBeDefined()
    const last = (await (await get(account, "/api/v4/leads?limit=2&page=2")).json()) as { _links: { next?: unknown } }
    expect(last._links.next).toBeUndefined()
    expect((await get(account, "/api/v4/leads?page=3&limit=2")).status).toBe(204)
  })

  it("reaches only its own account host", async () => {
    await expect(fakeAmo().fetch("https://other.amocrm.ru/api/v4/account", { headers })).rejects.toThrow(TypeError)
  })

  it("refuses a body where the operation takes none, and a write it has no answer for", async () => {
    const account = fakeAmo()
    expect((await get(account, "/api/v4/leads/pipelines", { method: "GET", body: "{}" })).status).toBe(400)
    expect((await get(account, "/api/v4/tasks", { method: "POST", body: "[]" })).status).toBe(501)
    expect((await get(account, "/api/v4/leads", { method: "PATCH", body: '{"id":1}' })).status).toBe(400)
    expect((await get(account, "/api/v4/leads", { method: "PATCH", body: '[{"id":999}]' })).status).toBe(404)
    expect((await get(account, "/api/v4/leads/999")).status).toBe(404)
  })

  it("holds a seeded account: won 142, lost 143 and an unsorted status in each pipeline, phones and e-mails as multitext", async () => {
    const { data } = fakeAmo()
    for (const pipeline of data.pipelines) {
      const ids = data.statuses.filter((one) => one.pipeline_id === pipeline.id)
      expect(ids.map((one) => one.id)).toEqual(expect.arrayContaining([142, 143]))
      expect(ids.some((one) => one.type === 1)).toBe(true)
    }
    for (const contact of data.contacts)
      expect(contact.custom_fields_values.map((one) => [one.field_code, one.field_type])).toEqual([
        ["PHONE", "multitext"],
        ["EMAIL", "multitext"],
      ])
  })

  it("answers 402 when unpaid, a bare 403 when blocked, and any status it is told to", async () => {
    expect((await get(fakeAmo({ unpaid: true }), "/api/v4/account")).status).toBe(402)
    const blocked = await get(fakeAmo({ blocked: true }), "/api/v4/account")
    expect(blocked.status).toBe(403)
    expect(blocked.headers.get("content-type")).not.toContain("json")
    expect((await get(fakeAmo({ failWith: 500 }), "/api/v4/account")).status).toBe(500)
  })
})

/** The CLI's own requests, as `route: "<VERB> /api/v4/…"` in its source, outside tests. */
const routesInSource = () => {
  const root = resolve(import.meta.dirname, "..")
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
    (one) =>
      one.endsWith(".ts") && !one.endsWith(".test.ts") && !one.startsWith("testing") && one !== "amo/operations.ts",
  )
  return files.flatMap((file) =>
    [
      ...readFileSync(join(root, file), "utf8").matchAll(/route: "((?:GET|POST|PATCH|PUT|DELETE) \/api\/v4\/[^"]*)"/g),
    ].map((found) => found[1] ?? ""),
  )
}

describe("contract: every route the CLI calls is in the spec or the allow-list", () => {
  const names = new Set(OPERATIONS.map((one) => one.name))

  it("finds each route of the source in the operation table", () => {
    const routes = routesInSource()
    expect(routes).toEqual(expect.arrayContaining(["GET /api/v4/account", "GET /api/v4/users/{id}"]))
    for (const route of routes) expect([route, names.has(route)]).toEqual([route, true])
  })

  it("names a page of the amoCRM docs for every allow-list entry, each route of it in the table", () => {
    const pages = [
      ...EXTRA_OPERATIONS.map((one) => one.source),
      ...Object.values(WITH_VALUES).map((one) => one.source),
      ...ENTITY_TYPES.sources,
      ...LIMITS.sources,
    ]
    for (const page of pages) expect(page).toMatch(/^https:\/\/www\.amocrm\.ru\/developers\/content\/crm_platform\//)
    for (const route of Object.keys(WITH_VALUES)) expect([route, names.has(route)]).toEqual([route, true])
    for (const one of EXTRA_OPERATIONS) expect(names.has(one.name.replace("{entity_type}", "leads"))).toBe(true)
    expect(EXTRA_OPERATIONS.length + Object.keys(WITH_VALUES).length).toBe(10)
  })
})
