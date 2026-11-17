import { crmSourceContract, crmWriteContract } from "@wirecat/cli-core/crm/testing"
import { describe, expect, it } from "vitest"
import { AmoTransport } from "../amo/transport.js"
import { FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID, type FakeAmoOptions, fakeAmo } from "../testing/fake-amo.js"
import { toDeal } from "./records.js"
import { amoCrmSource } from "./source.js"
import { amoCrmWriter } from "./writer.js"

const over = (options: FakeAmoOptions = {}, page?: number) => {
  const account = fakeAmo({ perSecond: 10_000, ...options })
  const origin = options.host ? `https://${options.host}` : FAKE_ORIGIN
  const transport = new AmoTransport({
    signIn: { origin, token: FAKE_TOKEN },
    fetch: account.fetch,
    sleep: async () => {},
  })
  const source = amoCrmSource(() => transport, page ? { page } : {})
  return { account, transport, source }
}

/** A source of its own over the same fake, as a new run builds one. */
const fresh = (account: ReturnType<typeof fakeAmo>, page?: number) =>
  amoCrmSource(
    () =>
      new AmoTransport({
        signIn: { origin: FAKE_ORIGIN, token: FAKE_TOKEN },
        fetch: account.fetch,
        sleep: async () => {},
      }),
    page ? { page } : {},
  )
type Changes = Awaited<ReturnType<ReturnType<typeof fresh>["changes"]>>
const SPENT = new Error("budget")
const throwSpent = (): never => {
  throw SPENT
}
/** A call that read nothing before the budget ran out stops the run, as core's sync does; the next run goes on. */
const spentOr = (error: unknown) => {
  if (error !== SPENT) throw error
  return null
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

  it("changes one part of a contact's name and keeps the rest of the contact", async () => {
    const { account, transport, source } = over()
    const writer = amoCrmWriter(() => transport, source)
    const before = await source.get?.("person", "401")
    const changed = await writer.update("person", "401", { firstName: "Ivan" }, { operationId: "a" })
    expect(changed).toMatchObject({ firstName: "Ivan", lastName: "Person 1", name: "Ivan Person 1" })
    expect({ ...changed, firstName: null, name: null, updatedAt: 0 }).toEqual({
      ...before,
      firstName: null,
      name: null,
      updatedAt: 0,
    })
    expect(account.data.contacts.find((one) => one.id === 401)?.name).toBe("Ivan Person 1")
  })

  it("keeps the kind of each phone it keeps, and gives a new one the work kind", async () => {
    const { account, transport, source } = over()
    const contact = account.data.contacts.find((one) => one.id === 401)
    const phones = contact?.custom_fields_values?.find((one) => one.field_code === "PHONE")
    if (!phones) throw new Error("seed")
    phones.values = [{ value: "+7 900 000-00-00", enum_code: "MOB", enum_id: 2 } as never]
    const writer = amoCrmWriter(() => transport, source)
    await writer.update("person", "401", { phones: ["+7 900 000-00-00", "+7 911 111-11-11"] }, { operationId: "a" })
    const kept = account.data.contacts
      .find((one) => one.id === 401)
      ?.custom_fields_values?.find((one) => one.field_code === "PHONE")
    expect(kept?.values.map((one) => [one.value, one.enum_code])).toEqual([
      ["+7 900 000-00-00", "MOB"],
      ["+7 911 111-11-11", "WORK"],
    ])
  })

  it("writes a company's phones and e-mails to its own fields, and refuses them on an account without such a field", async () => {
    const bare = over()
    await expect(
      amoCrmWriter(() => bare.transport, bare.source).update(
        "organization",
        "501",
        { phones: ["+7 900 000-00-09"] },
        { operationId: "a" },
      ),
    ).rejects.toThrow(/no phone field on companies/)
    const { account, transport, source } = over()
    const writer = amoCrmWriter(() => transport, source)
    const [phone, email] = account.data.customFields.contacts ?? []
    if (!phone || !email) throw new Error("seed")
    account.data.customFields.companies?.push(phone, email)
    await writer.update(
      "organization",
      "501",
      { phones: ["+7 900 000-00-09"], emails: ["office@example.test"] },
      { operationId: "b" },
    )
    const company = account.data.companies.find((one) => one.id === 501)
    expect(company?.custom_fields_values?.map((one) => [one.field_code, one.values.map((v) => v.value)])).toEqual([
      ["EMAIL", ["office@example.test"]],
      ["PHONE", ["+7 900 000-00-09"]],
    ])
  })

  it.each([
    ["lastName", "Sidorov", "Ivan Sidorov"],
    ["firstName", "Pyotr", "Pyotr Petrov"],
  ] as const)("splits a contact that has only a full name, so %s keeps the other part", async (part, value, name) => {
    const { account, transport, source } = over()
    const contact = account.data.contacts.find((one) => one.id === 401)
    if (!contact) throw new Error("seed")
    Object.assign(contact, { name: "Ivan Petrov", first_name: "", last_name: "" })
    await amoCrmWriter(() => transport, source).update("person", "401", { [part]: value }, { operationId: "a" })
    expect(contact.name).toBe(name)
  })

  // Stands in for cli-core's "an update of one field keeps the rest", left out above for `position` alone.
  it("makes a contact, and an update of one field keeps its name and e-mail; renames a company", async () => {
    const { transport, source } = over()
    const writer = amoCrmWriter(() => transport, source)
    const made = await writer.create(
      "person",
      { firstName: "Anna", lastName: "Example", emails: ["anna@example.com"] },
      { operationId: "a" },
    )
    const changed = await writer.update("person", made.externalId, { owner: "7002" }, { operationId: "b" })
    expect(changed).toMatchObject({ externalId: made.externalId, name: made.name, emails: ["anna@example.com"] })
    expect(changed.assignee).toBe("7002")
    const company = await writer.create("organization", { name: "Example contract company" }, { operationId: "c" })
    const renamed = await writer.update(
      "organization",
      company.externalId,
      { name: "Example renamed company" },
      { operationId: "d" },
    )
    expect(renamed).toMatchObject({ externalId: company.externalId, name: "Example renamed company" })
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
    expect(new Set(reads.map((one) => one.query.page?.[0])).size).toBeLessThan(5)
  })

  it.each([
    ["a first round, filters on", null, true],
    ["a first round, filters off", null, false],
    ["a later round, filters off", "later", false],
  ])("never skips a deal when one read before it is deleted between pages: %s", async (_, round, apiFilter) => {
    const { account, source } = over({ apiFilter }, 1)
    const top = Math.floor(Date.now() / 1000)
    if (round)
      for (const [lead, ago] of [
        [301, 60],
        [302, 15 * 60],
        [304, 20 * 60],
      ] as const) {
        const found = account.data.leads.find((one) => one.id === lead)
        if (found) found.updated_at = top - ago
      }
    const cursor = round ? new Date((top - 30 * 60) * 1000).toISOString() : null
    const ids = new Set<string>()
    let page: string | undefined
    for (;;) {
      const answer = await source.changes("deal", cursor, page, mine)
      if ("reset" in answer) throw new Error("reset")
      for (const one of answer.items) ids.add(one.externalId)
      if (ids.has("301") && account.data.leads.some((one) => one.id === 301)) account.remove("lead", 301, top)
      if (!answer.hasMore) break
      page = answer.nextCursor
    }
    expect(ids).toContain("302")
  })

  it.each([
    ["person", "contact", 402],
    ["organization", "company", 502],
  ] as const)("names a deleted %s", async (kind, entity, deleted) => {
    const { account, source } = over({}, 250)
    const cursor = new Date(Date.now() - 60_000).toISOString()
    account.remove(entity, deleted, Math.floor(Date.now() / 1000))
    const removed: string[] = []
    let page: string | undefined
    for (;;) {
      const answer = await source.changes(kind, cursor, page, mine)
      if ("reset" in answer) throw new Error("reset")
      removed.push(...(answer.removed ?? []))
      if (!answer.hasMore) break
      page = answer.nextCursor
    }
    expect(removed).toContain(String(deleted))
  })

  it("names a deleted record, and keeps one restored after its deletion", async () => {
    const { account, source } = over()
    account.remove("lead", 302, 1767225600 + 500)
    const event = (id: string, type: string, at: number) =>
      ({ ...account.data.events[0], id, type, entity_id: 301, entity_type: "lead", created_at: at }) as never
    account.data.events.push(
      event("r", "lead_restored", 1767225600 + 900),
      event("d", "lead_deleted", 1767225600 + 800),
    )
    const alive = new Map<string, boolean>()
    let page: string | undefined
    for (;;) {
      const answer = await source.changes("deal", new Date(1767225600 * 1000).toISOString(), page, mine)
      if ("reset" in answer) throw new Error("reset")
      for (const one of answer.items) alive.set(one.externalId, true)
      for (const one of answer.removed ?? []) alive.set(one, false)
      if (!answer.hasMore) break
      page = answer.nextCursor
    }
    expect([alive.get("301"), alive.get("302")]).toEqual([true, false])
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

  it("keeps only the stage moves of the scope's deals", async () => {
    const { account, source } = over()
    const [first] = account.data.events
    if (!first) throw new Error("seed")
    account.data.events.push({ ...first, id: "01fakeevent0303", entity_id: 303 })
    const page = await source.stageHistory?.("deal", 0, undefined, mine)
    expect(page?.items.map((one) => one.item)).toEqual(["302", "302"])
  })

  it("goes on reading stage history where a spent budget cut it", async () => {
    const { account, source } = over()
    const [first] = account.data.events
    if (!first) throw new Error("seed")
    for (let at = 0; at < 250; at++)
      account.data.events.push({ ...first, id: `01fakemove${at}`, created_at: first.created_at + 10 + at })
    let left = 1
    const spent = new Error("budget")
    const tight = {
      ...mine,
      spend: () => {
        if (left-- <= 0) throw spent
      },
    }
    const items: string[] = []
    let after: string | undefined
    for (let call = 0; call < 20; call++) {
      left = 1
      // A call that read nothing before the budget ran out stops the run, as core's sync does; the next run goes on.
      const page = await source.stageHistory?.("deal", 0, after, tight).catch((error: unknown) => {
        if (error !== spent) throw error
        return null
      })
      if (page === null) continue
      if (!page) throw new Error("no history")
      items.push(...page.items.map((one) => one.externalId))
      after = page.hasMore ? page.nextCursor : undefined
      if (!page.hasMore) break
    }
    expect(new Set(items).size).toBe(252)
  })

  it.each([
    ["wirecatfake.amocrm.ru", "filter[type][]"],
    ["wirecatfake.kommo.com", "filter[type]"],
  ])("names the event types on %s as %s", async (host, name) => {
    const { account, source } = over({ host })
    await source.stageHistory?.("deal", 0)
    const read = account.calls.find((one) => one.path === "/api/v4/events")
    expect(Object.keys(read?.query ?? {})).toContain(name)
  })

  it("moves the stage history cursor past colleagues' moves it leaves out", async () => {
    const { account, source } = over()
    const [first] = account.data.events
    if (!first) throw new Error("seed")
    account.data.events = [{ ...first, id: "01fakeeventX", entity_id: 303 }]
    const page = await source.stageHistory?.("deal", 0, undefined, mine)
    expect(page && "cursor" in page ? page.cursor : null).toBe(String(first.created_at))
    expect(page?.items).toEqual([])
  })

  it("goes on after the client it last decided when a row above it was deleted between runs", async () => {
    const account = fakeAmo({ perSecond: 10_000, apiFilter: false })
    const top = Math.floor(Date.now() / 1000) + 100
    const [lead] = account.data.leads
    const [contact] = account.data.contacts
    if (!lead || !contact) throw new Error("seed")
    for (let at = 0; at < 6; at++) {
      account.data.contacts.push({ ...contact, id: 600 + at, responsible_user_id: 7002, updated_at: top - at })
      account.data.leads.push({ ...lead, id: 700 + at, contacts: [600 + at], companies: [] })
    }
    const sourceOf = () =>
      amoCrmSource(() => new AmoTransport({ signIn: { origin: FAKE_ORIGIN, token: FAKE_TOKEN }, fetch: account.fetch }))
    let left = 0
    const spent = new Error("budget")
    const tight = {
      ...mine,
      spend: () => {
        if (left-- <= 0) throw spent
      },
    }
    const cursor = new Date().toISOString()
    const seen: string[] = []
    let page: string | undefined
    for (let call = 0; call < 40; call++) {
      // Each call is a run of its own; the account and fields are read before the budget counts.
      const source = sourceOf()
      await source.account()
      await source.fields("person")
      left = call === 0 ? 3 : 4
      const answer = await source.changes("person", cursor, page, tight).catch((error: unknown) => {
        if (error !== spent) throw error
        return null
      })
      if (answer === null) continue
      if ("reset" in answer) throw new Error("reset")
      seen.push(...answer.items.map((one) => one.externalId))
      if (call === 0)
        account.data.contacts.splice(
          account.data.contacts.findIndex((one) => one.id === 600),
          1,
        )
      if (!answer.hasMore) break
      page = answer.nextCursor
    }
    expect(seen).toEqual(expect.arrayContaining(["601", "602", "603", "604", "605"]))
  })

  it("keeps a record restored on a later events page than its deletion, though a run's budget cut between", async () => {
    const { account, source } = over()
    const base = 1767225600
    const event = (id: string, type: string, entity: number, at: number) =>
      ({ ...account.data.events[0], id, type, entity_id: entity, entity_type: "lead", created_at: at }) as never
    account.data.events.push(event("d", "lead_deleted", 301, base + 10))
    for (let at = 0; at < 220; at++)
      account.data.events.push(event(`f${at}`, "lead_deleted", 9000 + at, base + 20 + at))
    account.data.events.push(event("r", "lead_restored", 301, base + 500))
    // core's sync reads the account and the fields before it asks for changes.
    await source.account()
    await source.fields("deal")
    let left = 0
    const spent = new Error("budget")
    const tight = {
      ...mine,
      spend: () => {
        if (left-- <= 0) throw spent
      },
    }
    const alive = new Map<string, boolean>()
    let page: string | undefined
    for (let call = 0; call < 60; call++) {
      left = 2
      const answer = await source
        .changes("deal", new Date(base * 1000).toISOString(), page, tight)
        .catch((error: unknown) => {
          if (error !== spent) throw error
          return null
        })
      if (answer === null) continue
      if ("reset" in answer) throw new Error("reset")
      // core saves a page's items, then removes its removed.
      for (const one of answer.items) alive.set(one.externalId, true)
      for (const one of answer.removed ?? []) alive.set(one, false)
      if (!answer.hasMore) break
      page = answer.nextCursor
    }
    expect(alive.get("301")).toBe(true)
  })

  it("keeps a record restored after its deletion whatever order the events pages come in", async () => {
    const { account, source } = over()
    const base = 1767225600
    const event = (id: string, type: string, entity: number, at: number) =>
      ({ ...account.data.events[0], id, type, entity_id: entity, entity_type: "lead", created_at: at }) as never
    account.data.events.push(event("r", "lead_restored", 301, base + 500))
    for (let at = 219; at >= 0; at--)
      account.data.events.push(event(`f${at}`, "lead_deleted", 9000 + at, base + 20 + at))
    account.data.events.push(event("d", "lead_deleted", 301, base + 10))
    const alive = new Map<string, boolean>()
    let page: string | undefined
    for (let call = 0; call < 60; call++) {
      const answer = await source.changes("deal", new Date(base * 1000).toISOString(), page, mine)
      if ("reset" in answer) throw new Error("reset")
      for (const one of answer.items) alive.set(one.externalId, true)
      for (const one of answer.removed ?? []) alive.set(one, false)
      if (!answer.hasMore) break
      page = answer.nextCursor
    }
    expect([alive.get("301"), alive.get("9000")]).toEqual([true, false])
  })

  it("moves through an events page of restores under a budget of 20 requests a run", async () => {
    const account = fakeAmo({ perSecond: 10_000, apiFilter: false })
    const [lead] = account.data.leads
    if (!lead) throw new Error("seed")
    const base = Math.floor(Date.now() / 1000) - 60
    for (let at = 0; at < 30; at++) {
      account.data.leads.push({ ...lead, id: 3100 + at })
      account.data.events.push({
        ...account.data.events[0],
        id: `r${at}`,
        type: "lead_restored",
        entity_id: 3100 + at,
        entity_type: "lead",
        created_at: base + at,
      } as never)
    }
    const seen = new Set<string>()
    let page: string | undefined = `r1.0@${Date.now()}`
    for (let run = 0; run < 6 && page; run++) {
      const source = fresh(account)
      await source.account()
      await source.fields("deal")
      let left = 19
      const tight = { ...mine, spend: () => (left-- <= 0 ? throwSpent() : undefined) }
      const answer: Changes | null = await source
        .changes("deal", new Date(base * 1000).toISOString(), page, tight)
        .catch(spentOr)
      if (answer === null || "reset" in answer) continue
      for (const one of answer.items) seen.add(one.externalId)
      page = answer.hasMore ? answer.nextCursor : undefined
    }
    expect(page).toBeUndefined()
    expect([...seen].filter((one) => one.startsWith("31"))).toHaveLength(30)
  })

  it("never skips a changed client when rows above it are deleted between runs", async () => {
    const account = fakeAmo({ perSecond: 10_000, apiFilter: false })
    const top = Math.floor(Date.now() / 1000) + 100
    const [lead] = account.data.leads
    const [contact] = account.data.contacts
    if (!lead || !contact) throw new Error("seed")
    for (let at = 0; at < 6; at++) {
      account.data.contacts.push({
        ...contact,
        id: 600 + at,
        responsible_user_id: 7002,
        companies: [],
        updated_at: top - at,
      })
      account.data.leads.push({ ...lead, id: 700 + at, contacts: [600 + at], companies: [] })
    }
    const cursor = new Date().toISOString()
    const seen: string[] = []
    let page: string | undefined = `c2.0@${Date.now()}`
    for (let call = 0; call < 20 && page; call++) {
      const source = fresh(account, 2)
      await source.account()
      await source.fields("person")
      let left = call === 0 ? 1 : 100
      const tight = { ...mine, spend: () => (left-- <= 0 ? throwSpent() : undefined) }
      const answer: Changes | null = await source.changes("person", cursor, page, tight).catch(spentOr)
      if (answer === null || "reset" in answer) continue
      seen.push(...answer.items.map((one) => one.externalId))
      if (call === 0) account.data.contacts = account.data.contacts.filter((one) => one.id !== 600 && one.id !== 601)
      page = answer.hasMore && answer.nextCursor?.startsWith("c") ? answer.nextCursor : undefined
    }
    expect(seen).toEqual(expect.arrayContaining(["603", "604", "605"]))
  })

  it.each([
    ["the clients of changed leads", "n", "updated"],
    ["a first round's clients", "w", "given away"],
  ])("never skips a company in %s when a lead naming it moves between runs", async (_, phase, how) => {
    const account = fakeAmo({ perSecond: 10_000, apiFilter: false })
    const top = Math.floor(Date.now() / 1000) + 100
    const [lead] = account.data.leads
    const [company] = account.data.companies
    if (!lead || !company) throw new Error("seed")
    for (const one of [901, 902, 910, 911, 912])
      account.data.companies.push({ ...company, id: one, responsible_user_id: 7001 })
    const named = (id: number, to: number, at: number) => ({
      ...lead,
      id,
      responsible_user_id: 7001,
      contacts: [],
      companies: [to],
      updated_at: top - at,
    })
    account.data.leads = [
      named(800, 910, 0),
      named(801, 911, 1),
      named(802, 912, 2),
      named(803, 901, 3),
      named(804, 902, 4),
      named(805, 901, 5),
    ]
    const cursor = phase === "n" ? new Date().toISOString() : null
    const seen: string[] = []
    let page: string | undefined = `${phase}2.0@${Date.now()}`
    for (let call = 0; call < 20 && page; call++) {
      const source = fresh(account, 3)
      await source.account()
      await source.fields("organization")
      let left = call === 0 ? 1 : 100
      const tight = { ...mine, spend: () => (left-- <= 0 ? throwSpent() : undefined) }
      const answer: Changes | null = await source.changes("organization", cursor, page, tight).catch(spentOr)
      if (answer === null || "reset" in answer) continue
      seen.push(...answer.items.map((one) => one.externalId))
      const moved = account.data.leads.find((one) => one.id === 803)
      if (call === 0 && moved) {
        if (how === "updated") moved.updated_at = top + 50
        else moved.responsible_user_id = 7002
      }
      page = answer.hasMore && answer.nextCursor?.startsWith(phase) ? answer.nextCursor : undefined
    }
    expect(seen).toContain("902")
  })

  it("resumes a client's owner lookup by lead id, so a lead deleted between runs does not hide a chosen one", async () => {
    const account = fakeAmo({ perSecond: 10_000, apiFilter: false })
    const [lead] = account.data.leads
    const [contact] = account.data.contacts
    if (!lead || !contact) throw new Error("seed")
    account.data.contacts.push({
      ...contact,
      id: 650,
      responsible_user_id: 7002,
      companies: [],
      updated_at: Math.floor(Date.now() / 1000) + 100,
    })
    for (let at = 0; at < 20; at++)
      account.data.leads.push({
        ...lead,
        id: 3000 + at,
        responsible_user_id: at === 10 ? 7001 : 7002,
        contacts: [650],
        companies: [],
      })
    const cursor = new Date().toISOString()
    let found: { phones?: string[] } | undefined
    let page: string | undefined = `c1.0@${Date.now()}`
    for (let call = 0; call < 10 && page; call++) {
      const source = fresh(account)
      await source.account()
      await source.fields("person")
      let left = call === 0 ? 10 : 100
      const tight = { ...mine, spend: () => (left-- <= 0 ? throwSpent() : undefined) }
      const answer: Changes | null = await source.changes("person", cursor, page, tight).catch(spentOr)
      if (answer === null || "reset" in answer) continue
      found ??= answer.items.find((one) => one.externalId === "650") as { phones?: string[] } | undefined
      if (call === 0) account.data.leads = account.data.leads.filter((one) => one.id !== 3000)
      page = answer.hasMore && answer.nextCursor?.startsWith("c") ? answer.nextCursor : undefined
    }
    expect(found?.phones?.length).toBeGreaterThan(0)
  })

  it("reads stage history again from a little before its cursor, and names each move once", async () => {
    const { account, source } = over()
    const [first] = account.data.events
    if (!first) throw new Error("seed")
    const page = await source.stageHistory?.("deal", 0, String(first.created_at + 5))
    expect(page?.items.map((one) => one.externalId)).toContain(first.id)
    expect(new Set(page?.items.map((one) => one.externalId)).size).toBe(page?.items.length)
  })

  it("lists by an exact time to the second it names", async () => {
    const { account, source } = over()
    await source.list?.("person", {
      conditions: [{ field: "updated_at", op: "=", value: 1_767_312_000_500 }],
      limit: 5,
    } as never)
    const read = account.calls.find((one) => one.path === "/api/v4/contacts")
    expect(read?.query).toMatchObject({
      "filter[updated_at][from]": ["1767312000"],
      "filter[updated_at][to]": ["1767312000"],
    })
  })
})

describe("a deal's close date", () => {
  it("is the day in the account's time zone, and the UTC day when amoCRM names none", () => {
    const won = {
      id: 1,
      name: "x",
      status_id: 142,
      pipeline_id: 1,
      price: 5,
      closed_at: Date.UTC(2026, 10, 16, 22, 30) / 1000,
    }
    expect(toDeal(won, [], "RUB", "Europe/Moscow").closedDate).toBe("2026-11-17")
    expect(toDeal(won, [], "RUB", null).closedDate).toBe("2026-11-16")
    expect(toDeal(won, [], "RUB", "Not/AZone").closedDate).toBe("2026-11-16")
  })

  it("reads the account's time zone with the account", async () => {
    const { account, source } = over()
    await source.account()
    const read = account.calls.find((one) => one.path === "/api/v4/account")
    expect(read?.query.with?.[0]).toContain("datetime_settings")
  })
})
