import { crmSourceContract, crmWriteContract } from "@wirecat/cli-core/crm/testing"
import { describe, expect, it } from "vitest"
import { AmoTransport } from "../amo/transport.js"
import { FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID, type FakeAmoOptions, fakeAmo } from "../testing/fake-amo.js"
import { amoCrmSource } from "./source.js"
import { amoCrmWriter } from "./writer.js"

const over = (options: FakeAmoOptions = {}, page?: number) => {
  const account = fakeAmo({ perSecond: 10_000, ...options })
  const transport = new AmoTransport({ signIn: { origin: FAKE_ORIGIN, token: FAKE_TOKEN }, fetch: account.fetch })
  const source = amoCrmSource(() => transport, page ? { page } : {})
  return { account, transport, source }
}

const mine = { scope: { mode: "mine" as const, self: String(FAKE_USER_ID), also: [] }, spend: () => {}, gap: () => {} }

const all = async (
  source: ReturnType<typeof amoCrmSource>,
  kind: "deal" | "person" | "organization",
  cursor: string | null,
) => {
  const ids: string[] = []
  const pages: string[] = []
  let page: string | undefined
  for (;;) {
    const answer = await source.changes(kind, cursor, page, mine)
    if ("reset" in answer) throw new Error("reset")
    ids.push(...answer.items.map((one) => one.externalId))
    if (!answer.hasMore) return { ids: ids.sort(), pages, answer }
    page = answer.nextCursor
    pages.push(page ?? "")
  }
}

/* cli-core's contracts, over the source and the strict fake, with the add-on on and off. */
for (const apiFilter of [true, false])
  describe(`crmSourceContract, API filters ${apiFilter ? "on" : "off"}`, () => {
    for (const one of crmSourceContract(() => {
      const { source } = over({ apiFilter }, 2)
      return {
        source,
        live: { person: ["401", "402", "403"], organization: ["501", "502"] },
        deadCursor: { kind: "deal", cursor: "not-a-time" },
      }
    }))
      it(one.name, () => one.run())
  })

/**
 * Two cases cli-core runs on every CRM do not fit amoCRM's API, so they are left out here and their part covered
 * below: `remove`, since API v4 has no call that deletes a lead, and a contact's `position`, which amoCRM keeps in an
 * account's own field with no documented code (contacts-api).
 */
const UNFIT = new Set([
  "remove answers once the CRM deleted it",
  "a contact's or company's create answers the whole record, and an update of one field keeps the rest",
])

describe("crmWriteContract", () => {
  for (const one of crmWriteContract(async () => {
    const { account, transport, source } = over({ currency: "EUR" })
    const [pipeline] = await source.pipelines("deal")
    if (!pipeline) throw new Error("the fake has a pipeline")
    return {
      writer: amoCrmWriter(() => transport, source),
      pipeline,
      aliases: ["status_id", "responsible_user_id", "pipeline_id"],
      loseNextAnswer: account.loseNextWrite,
      requests: account.writes,
    }
  }).filter((one) => !UNFIT.has(one.name)))
    it(one.name, () => one.run())

  it("refuses remove before sending anything", async () => {
    const { account, transport, source } = over()
    await expect(
      amoCrmWriter(() => transport, source).remove("deal", "301", { operationId: "x" }),
    ).rejects.toMatchObject({
      details: { reason: "crm.write-unsupported" },
    })
    expect(account.writes()).toBe(0)
  })

  it.each([
    ["deal", { custom: { status_id: "1" } }, "--field"],
    ["deal", { people: ["401"] }, undefined],
    ["deal", { owner: null }, "--owner"],
    ["deal", { closeDate: "2026-12-01" }, "--close-date"],
    ["deal", { organization: "501" }, "--organization"],
    ["deal", { currency: "EUR" }, "--currency"],
    ["deal", { stage: "first" }, "--stage"],
    ["deal", {}, undefined],
    ["person", { owner: null }, "--owner"],
    ["person", { custom: { "9001": "+7 900" } }, undefined],
    ["organization", { owner: null }, "--owner"],
  ] as const)("refuses a %s update of %o before sending anything", async (kind, patch, param) => {
    const { account, transport, source } = over()
    const writer = amoCrmWriter(() => transport, source)
    const id = { deal: "301", person: "401", organization: "501" }[kind]
    await expect(writer.update(kind, id, patch as never, { operationId: "x" })).rejects.toMatchObject({
      details: { reason: "crm.record-field", ...(param ? { param } : {}) },
    })
    expect(account.writes()).toBe(0)
  })

  it("closes won without a reason, and refuses a reason amoCRM does not have", async () => {
    const { account, transport, source } = over()
    const writer = amoCrmWriter(() => transport, source)
    await expect(writer.close("deal", "301", "won", { operationId: "a", reason: "дорого" })).rejects.toMatchObject({
      details: { param: "--reason" },
    })
    await expect(writer.close("deal", "301", "lost", { operationId: "b", reason: "weather" })).rejects.toMatchObject({
      details: { param: "--reason" },
    })
    expect(account.writes()).toBe(0)
    expect(await writer.close("deal", "301", "won", { operationId: "c" })).toMatchObject({ stage: "142" })
  })

  it("makes a company, and renames it keeping its note", async () => {
    const { transport, source } = over()
    const writer = amoCrmWriter(() => transport, source)
    const made = await writer.create(
      "organization",
      { name: "Example LLC", custom: { "9201": "x" } },
      { operationId: "a" },
    )
    expect(made).toMatchObject({ name: "Example LLC", metadata: { "9201": { value: "x" } } })
    const renamed = await writer.update("organization", made.externalId, { name: "Example Ltd" }, { operationId: "b" })
    expect(renamed).toMatchObject({ name: "Example Ltd", metadata: { "9201": { value: "x" } } })
  })

  it("makes a contact with its e-mail, and renames it keeping the rest", async () => {
    const { transport, source } = over()
    const writer = amoCrmWriter(() => transport, source)
    const made = await writer.create(
      "person",
      { firstName: "Anna", lastName: "Example", emails: ["anna@example.com"] },
      { operationId: "a" },
    )
    expect(made).toMatchObject({ name: "Anna Example", emails: ["anna@example.com"] })
    const changed = await writer.update("person", made.externalId, { lastName: "Renamed" }, { operationId: "b" })
    expect(changed).toMatchObject({ externalId: made.externalId, lastName: "Renamed", emails: ["anna@example.com"] })
    await expect(
      writer.update("person", made.externalId, { position: "Buyer" }, { operationId: "c" }),
    ).rejects.toMatchObject({
      details: { reason: "crm.record-field" },
    })
  })
})

describe("amoCrmSource", () => {
  it.each([true, false])(
    "pages a mine round over several pages, filters %s, and never repeats a page",
    async (apiFilter) => {
      const { source } = over({ apiFilter }, 1)
      const deals = await all(source, "deal", null)
      expect(deals.ids).toEqual(["301", "302", "304"])
      expect(deals.pages.length).toBeGreaterThan(1)
      expect((await all(source, "person", null)).ids).toEqual(["401", "402"])
      expect((await all(source, "organization", null)).ids).toEqual(["501"])
    },
  )

  it.each([true, false])("names a changed client once when its lead changed too, filters %s", async (apiFilter) => {
    const { account, source } = over({ apiFilter }, 1)
    const at = Math.floor(Date.now() / 1000) + 60
    for (const one of [account.data.leads.find((lead) => lead.id === 301), account.data.companies[0]])
      if (one) one.updated_at = at
    const { ids } = await all(source, "organization", new Date((at - 120) * 1000).toISOString())
    expect(ids).toEqual(["501"])
  })

  it("reads changes without the add-on newest first, and stops at the cursor", async () => {
    const { account, source } = over({ apiFilter: false }, 1)
    const cursor = new Date((1767225600 + 86400 + 302) * 1000 + 10 * 60_000).toISOString()
    const { ids } = await all(source, "deal", cursor)
    expect(ids).toEqual(["302", "303", "304"])
    const reads = account.calls.filter((one) => one.path === "/api/v4/leads")
    expect(reads.every((one) => one.query["order[updated_at]"]?.[0] === "desc")).toBe(true)
    expect(reads.length).toBeLessThan(5)
  })

  it("names a deleted record from its last event, so a restored one stays", async () => {
    const { account, source } = over()
    account.remove("contact", 402, 1767225600 + 500)
    account.data.events.push({
      ...account.data.events[0],
      id: "r",
      type: "contact_restored",
      entity_id: 401,
      entity_type: "contact",
      created_at: 1767225600 + 900,
    } as never)
    account.data.events.push({
      ...account.data.events[0],
      id: "d",
      type: "contact_deleted",
      entity_id: 401,
      entity_type: "contact",
      created_at: 1767225600 + 800,
    } as never)
    const { answer } = await all(source, "person", new Date(1767225600 * 1000).toISOString())
    expect("removed" in answer && answer.removed).toEqual(["402"])
  })

  it("reads stage history from lead_status_changed events, oldest first, after the last one read", async () => {
    const { source } = over()
    const first = await source.stageHistory?.("deal", 0)
    expect(first?.items.map((one) => [one.item, one.pipeline, one.stage])).toEqual([
      ["302", "5001", "50012"],
      ["302", "5001", "142"],
    ])
    expect(first?.cursor).toBe(String(1767225600 + 2000))
    expect((await source.stageHistory?.("deal", 0, first?.cursor ?? undefined))?.items).toHaveLength(1)
  })

  it("marks the contact fields that hold phones and e-mails", async () => {
    const { source } = over()
    expect((await source.fields("person")).map((one) => [one.code, one.holds ?? null])).toEqual([
      ["9001", "phone"],
      ["9002", "email"],
      ["9201", null],
    ])
  })

  it("is the administrator's, and owns a client on its own lead or assigned to it", async () => {
    expect(await over().source.isAdmin?.()).toBe(true)
    expect(await over({ admin: false }).source.isAdmin?.()).toBe(false)
    const { source } = over({ apiFilter: false })
    expect([...((await source.ownClients?.("person", ["401", "402", "403"])) ?? [])].sort()).toEqual(["401", "402"])
    expect([...((await source.ownClients?.("organization", ["501", "502"])) ?? [])]).toEqual(["501"])
  })

  it("refuses to copy the whole account", async () => {
    const { transport } = over()
    const source = amoCrmSource(() => transport, { asked: async () => ({ mode: "all", setting: "s", chosen: "c" }) })
    await expect(source.self?.()).rejects.toMatchObject({ details: { reason: "amo.scope-all-refused" } })
  })
})
