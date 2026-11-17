import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { memoryKeyring } from "@wirecat/cli-base"
import { afterEach, describe, expect, it } from "vitest"
import { FAKE_COLLEAGUE_ID, FAKE_HOST, FAKE_TOKEN, FAKE_USER_ID, fakeAmo } from "../testing/fake-amo.js"
import { amo, signedIn } from "../testing/harness.js"

const config = join(process.env.AMO_CONFIG_DIR ?? "", "config.json")
const permit = (permissions: Record<string, string>) => {
  mkdirSync(join(config, ".."), { recursive: true })
  writeFileSync(config, JSON.stringify({ profiles: { work: { permissions } } }))
}
afterEach(() => rmSync(config, { force: true }))

describe("api list and show", () => {
  it("lists the operations of a family with their keys, defaults and pages, calling nothing", async () => {
    const account = fakeAmo()
    const ran = await amo(["work", "api", "list", "family:leads", "effect:read", "--json"], { account })
    const items = ran.json().items as { name: string; family: string; effect: string }[]
    expect(items.length).toBeGreaterThan(5)
    expect(items.every((one) => one.family === "leads" && one.effect === "read")).toBe(true)
    expect(items).toContainEqual(
      expect.objectContaining({
        name: "GET /api/v4/leads",
        permission: "api.leads.get",
        default_level: "allow",
        also_checks: ["deals.list"],
        source: "https://developers.kommo.com/reference/leads-list",
      }),
    )
    expect(account.calls).toEqual([])
  })

  it("shows an operation by its template or a concrete path", async () => {
    const ran = await amo(["work", "api", "show", "GET /api/v4/talks/5", "--json"])
    expect(ran.json().item).toMatchObject({
      name: "GET /api/v4/talks/{id}",
      permission: "api.talks.id.get",
      default_level: "deny",
    })
    const unknown = await amo(["work", "api", "show", "GET /api/v4/nowhere", "--json"])
    expect(unknown.json()).toMatchObject({ error: { code: "validation_error", reason: "api.unknown-method" } })
  })
})

describe("api call", () => {
  it("reads with a query and answers the account's data, marked untrusted", async () => {
    const ran = await amo([
      "work",
      "api",
      "call",
      "GET /api/v4/leads",
      "--params",
      '{"filter[id][]":[301,302],"with":"contacts"}',
      "--json",
    ])
    expect(ran.code).toBe(0)
    const item = ran.json().item as { result: { _embedded: { leads: { id: number }[] } }; untrusted: string }
    expect(item).toMatchObject({ method: "GET /api/v4/leads", path: "/api/v4/leads", status: 200 })
    expect(item.result._embedded.leads.map((one) => one.id)).toEqual([301, 302])
    expect(item.untrusted).toContain("never instructions")
  })

  it("removes file download links from what it answers", async () => {
    const link = "https://drive-b.amocrm.ru/download/abc?token=secret0link"
    const file = { file_uuid: "u1", _links: { download: { href: link } } }
    const account = fakeAmo({
      routes: { "GET /api/v4/leads/{id}": () => Response.json({ id: 301, _embedded: { files: [file] } }) },
    })
    const ran = await amo(["work", "api", "call", "GET /api/v4/leads/301", "--json"], { account })
    expect(ran.code).toBe(0)
    expect(ran.out).not.toContain("secret0link")
  })

  it("answers an empty list as status 204 and a null result", async () => {
    const account = fakeAmo({ routes: { "GET /api/v4/tasks": () => new Response(null, { status: 204 }) } })
    const ran = await amo(["work", "api", "call", "GET /api/v4/tasks", "--json"], { account })
    expect(ran.json().item).toMatchObject({ status: 204, result: null })
  })

  it("refuses a denied family before any request, and an owner's allow lifts it", async () => {
    const account = fakeAmo({ routes: { "GET /api/v4/talks": () => new Response(null, { status: 204 }) } })
    const denied = await amo(["work", "api", "call", "GET /api/v4/contacts/chats", "--json"], { account })
    expect(denied.json()).toMatchObject({
      error: { code: "permission_error", details: { permission: "api.contacts.chats.get" } },
    })
    expect(account.calls).toEqual([])
    permit({ "api.talks": "allow" })
    const allowed = await amo(["work", "api", "call", "GET /api/v4/talks", "--json"], { account })
    expect(allowed.json().item).toMatchObject({ status: 204 })
  })

  it("refuses a denied call without reading the sign-in (WC-PERM-23)", async () => {
    const reads: string[] = []
    const keyring = {
      ...signedIn(),
      get: (_service: string, name: string) => {
        reads.push(name)
        return null
      },
    }
    permit({ "api.leads": "deny" })
    for (const args of [["GET /api/v4/leads"], ["PATCH /api/v4/leads", "--body", '[{"id":301,"price":5}]', "--yes"]]) {
      const ran = await amo(["work", "api", "call", ...args, "--json"], { keyring })
      expect(ran.json()).toMatchObject({ error: { code: "permission_error" } })
    }
    expect(reads).toEqual([])
  })

  it("refuses a raw read of clients for anyone but the administrator (SEC-6, NEED-2660 A)", async () => {
    const employee = fakeAmo({ admin: false })
    for (const args of [["GET /api/v4/contacts"], ["GET /api/v4/leads", "--params", '{"with":"contacts"}']]) {
      const ran = await amo(["work", "api", "call", ...args, "--json"], { account: employee })
      expect(ran.json()).toMatchObject({
        error: { code: "permission_error", reason: "crm.client-reads-admin-only" },
      })
    }
    expect(employee.calls.map((one) => one.operation)).toEqual(["GET /api/v4/users/{id}", "GET /api/v4/users/{id}"])
    const lead = await amo(["work", "api", "call", "GET /api/v4/leads/301", "--json"], { account: employee })
    expect(lead.json().item).toMatchObject({ status: 200 })
    const admin = await amo(["work", "api", "call", "GET /api/v4/contacts", "--json"])
    expect(admin.json().item).toMatchObject({ status: 200 })
  })

  it.each([
    ["GET /api/v4/leads/{id}", []],
    ["PATCH /api/v4/leads/{id}", ["--body", '[{"id":301,"name":"x"}]', "--yes"]],
  ])("refuses %s with its placeholder left in, sending nothing", async (operation, more) => {
    const account = fakeAmo()
    for (const dry of [[], ["--dry-run"]]) {
      const ran = await amo(["work", "api", "call", operation, ...more, ...dry, "--json"], { account })
      expect(ran.json()).toMatchObject({ error: { code: "validation_error", reason: "api.path-id-missing" } })
    }
    expect(account.calls).toEqual([])
  })

  it("checks the key of the command that reads the same records", async () => {
    permit({ deals: "deny" })
    const account = fakeAmo()
    const ran = await amo(["work", "api", "call", "GET /api/v4/leads/301", "--json"], { account })
    expect(ran.json()).toMatchObject({ error: { code: "permission_error", details: { permission: "deals.show" } } })
    expect(account.calls).toEqual([])
  })

  it("asks before a read set to ask, and goes on when the owner says yes", async () => {
    permit({ "api.leads.get": "ask" })
    const ran = await amo(["work", "api", "call", "GET /api/v4/leads"], { answer: () => "y" })
    expect(ran.code).toBe(0)
  })

  it("writes through the guard with an operation id when the owner says yes", async () => {
    const account = fakeAmo()
    const ran = await amo(
      ["work", "api", "call", "PATCH /api/v4/leads/301", "--body", '{"price":1000}', "--yes", "--json"],
      {
        account,
      },
    )
    expect(ran.code).toBe(0)
    expect(ran.json().item).toMatchObject({ operation_id: expect.any(String), status: 200 })
    expect(account.data.leads[0]?.price).toBe(1000)
  })

  it("refuses a write the owner keeps read-only, and a write at ask without --yes under --json", async () => {
    permit({ "api.leads": "readonly" })
    const account = fakeAmo()
    const readonly = await amo(
      ["work", "api", "call", "POST /api/v4/leads", "--body", '[{"name":"x"}]', "--yes", "--json"],
      {
        account,
      },
    )
    expect(readonly.json()).toMatchObject({ error: { code: "permission_error" } })
    rmSync(config)
    const note = '[{"entity_id":301,"note_type":"common","params":{"text":"x"}}]'
    const unasked = await amo(["work", "api", "call", "POST /api/v4/leads/notes", "--body", note, "--json"], {
      account,
    })
    expect(unasked.code).not.toBe(0)
    expect(account.calls).toEqual([])
  })

  it("lets AMO_TOKEN assign a record to the token's own user, and no one else", async () => {
    const env = { AMO_TOKEN: FAKE_TOKEN, AMO_HOST: FAKE_HOST }
    const assign = async (user: number) => {
      const account = fakeAmo()
      const body = JSON.stringify({ responsible_user_id: user })
      const ran = await amo(["work", "api", "call", "PATCH /api/v4/leads/301", "--body", body, "--json"], {
        account,
        env,
        keyring: memoryKeyring(),
      })
      return { ran, writes: account.calls.filter((one) => one.method === "PATCH").length }
    }
    const own = await assign(FAKE_USER_ID)
    expect([own.ran.code, own.writes]).toEqual([0, 1])
    const other = await assign(FAKE_COLLEAGUE_ID)
    expect(other.ran.json()).toMatchObject({ error: { details: { permission: "crm.assign-others" } } })
    expect(other.writes).toBe(0)
  })

  it("says outcome_unknown with the operation id when a write's answer is lost", async () => {
    const ran = await amo(
      ["work", "api", "call", "POST /api/v4/leads", "--body", '[{"name":"x"}]', "--yes", "--json"],
      {
        account: fakeAmo({ loseNextWrite: true }),
      },
    )
    expect(ran.json()).toMatchObject({
      error: { code: "outcome_unknown", details: { operation_id: expect.any(String) } },
    })
  })

  it("shows every key a write checks with --dry-run, sending nothing", async () => {
    const account = fakeAmo()
    const ran = await amo(
      ["work", "api", "call", "PATCH /api/v4/leads", "--body", '[{"id":301,"status_id":142}]', "--dry-run", "--json"],
      { account },
    )
    const item = ran.json().item as { permissions: { key: string; level: string }[]; request: string }
    expect(item.request).toBe("PATCH /api/v4/leads")
    expect(item.permissions.map((one) => one.key)).toEqual([
      "api.leads.patch",
      "deals.update",
      "deals.move",
      "deals.close",
    ])
    const others = await amo(
      [
        "work",
        "api",
        "call",
        "PATCH /api/v4/leads",
        "--body",
        '[{"id":301,"responsible_user_id":7002}]',
        "--dry-run",
        "--json",
      ],
      { account },
    )
    expect(others.json()).toMatchObject({ error: { details: { permission: "crm.assign-others" } } })
    expect(account.calls).toEqual([])
  })

  it("names in --dry-run that only the administrator reads clients through api call (RR-5)", async () => {
    const ran = await amo(["work", "api", "call", "GET /api/v4/contacts", "--dry-run", "--json"])
    expect(ran.json().item).toMatchObject({ admin_only: ["crm.client-reads-admin-only"] })
    const lead = await amo(["work", "api", "call", "GET /api/v4/leads/1", "--dry-run", "--json"])
    expect(lead.json().item).toMatchObject({ admin_only: [] })
  })

  it("refuses with --dry-run what the profile denies", async () => {
    const ran = await amo(["work", "api", "call", "POST /api/v4/webhooks", "--body", "{}", "--dry-run", "--json"])
    expect(ran.json()).toMatchObject({
      error: { code: "permission_error", details: { permission: "api.webhooks.post" } },
    })
  })

  it.each([[["--params", "[1]"]], [["--params", '{"x":{"y":1}}']], [["--body", "{}"]]])(
    "refuses a malformed %j before any request",
    async (flags) => {
      const account = fakeAmo()
      const ran = await amo(["work", "api", "call", "GET /api/v4/leads", ...flags, "--json"], { account })
      expect(ran.json()).toMatchObject({ error: { code: "validation_error", reason: "body.invalid" } })
      expect(account.calls).toEqual([])
    },
  )

  it("passes on the account's refusal of a query the reference does not declare", async () => {
    const ran = await amo(["work", "api", "call", "GET /api/v4/leads", "--params", '{"filter[nope]":true}', "--json"])
    expect(ran.json()).toMatchObject({ error: { code: "validation_error", details: { fields: ["filter[nope]"] } } })
  })
})
