import { memoryKeyring } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { openAmoStore } from "../store.js"
import {
  FAKE_COLLEAGUE_ID,
  FAKE_HOST,
  FAKE_ORIGIN,
  FAKE_TOKEN,
  type FakeAmo,
  type FakeAmoOptions,
  fakeAmo,
} from "../testing/fake-amo.js"
import { amo, FAKE_SIGN_IN } from "../testing/harness.js"

const account = (options: FakeAmoOptions = {}) => fakeAmo({ perSecond: 10_000, ...options })

interface Listed {
  items: Record<string, unknown>[]
  has_more?: boolean
}

const listed = async (fake: FakeAmo, args: string[]) => {
  const ran = await amo(["work", ...args, "--json"], { account: fake })
  expect([args.join(" "), ran.code, ran.err]).toEqual([args.join(" "), 0, ""])
  return ran.json() as unknown as Listed
}

const idsOf = (list: Listed, key = "external_id") => list.items.map((one) => String(one[key])).sort()

const sync = async (fake: FakeAmo) => {
  const ran = await amo(["work", "sync", "--json"], { account: fake })
  expect([ran.code, ran.err]).toEqual([0, ""])
  return ran.json()
}

/** `count` more leads of the signed-in user, each with a contact of its own. */
const grown = (fake: FakeAmo, count: number) => {
  const [lead] = fake.data.leads
  const [contact] = fake.data.contacts
  if (!lead || !contact) throw new Error("seed")
  for (let at = 0; at < count; at++) {
    fake.data.contacts.push({ ...contact, id: 1000 + at, name: `Extra ${at}`, companies: [] })
    fake.data.leads.push({ ...lead, id: 2000 + at, name: `Extra lead ${at}`, contacts: [1000 + at], companies: [] })
  }
}

const people = async () => {
  const store = await openAmoStore(process.env)
  try {
    return await store.crm.count({ provider: "amocrm", account: FAKE_HOST }, "person")
  } finally {
    await store.close()
  }
}

const reads = (fake: FakeAmo, path: string) => fake.calls.filter((one) => one.method === "GET" && one.path === path)

describe("sync", () => {
  it.each([
    ["with the API filter add-on", true],
    ["without it", false],
  ])("copies the user's own deals and only their clients, %s", async (_, apiFilter) => {
    const fake = account({ apiFilter })
    await sync(fake)
    // 303 is the colleague's; its contact 403 and company 502 are on no deal of ours.
    expect(idsOf(await listed(fake, ["deals", "list"]))).toEqual(["301", "302", "304"])
    const filtered = fake.calls.filter((one) => Object.keys(one.query).some((name) => name.startsWith("filter[")))
    if (!apiFilter) expect(filtered.every((one) => one.operation === "GET /api/v4/events")).toBe(true)
    else expect(filtered.some((one) => one.query["filter[responsible_user_id][]"]?.[0] === "7001")).toBe(true)
    const shown = (await amo(["work", "deals", "show", "deal:1", "--json"], { account: fake })).json()
    expect(JSON.stringify(shown)).not.toContain("Test Person 3")
  })

  it("names won and lost by 142 and 143, in the account's currency, and copies both pipelines", async () => {
    const fake = account()
    await amo(["work", "config", "set", "crm.amocrm:wirecatfake.amocrm.ru.unassigned", "7001,7002", "--json"], {
      account: fake,
    })
    await sync(fake)
    const deals = await listed(fake, ["deals", "list"])
    const byId = Object.fromEntries(deals.items.map((one) => [String(one.external_id), one]))
    expect(byId["302"]).toMatchObject({ status: "won", amount: "3020.00", currency: "RUB" })
    expect(byId["303"]).toMatchObject({ status: "lost" })
    expect(byId["301"]).toMatchObject({ status: "open" })
    const pipelines = await listed(fake, ["pipelines", "list"])
    expect(pipelines.items.map((one) => one.name).sort()).toEqual(["Партнёры", "Продажи"])
  })

  it("syncs when the account's stage history names a colleague's deal, which is not in the copy", async () => {
    const fake = account()
    const [first] = fake.data.events
    if (!first) throw new Error("seed")
    fake.data.events.push({ ...first, id: "01fakeevent0303", entity_id: 303, created_at: first.created_at + 10 })
    await sync(fake)
    expect(idsOf(await listed(fake, ["deals", "list"]))).toEqual(["301", "302", "304"])
  })

  it("takes the changes after its cursor, and marks a deleted deal from the lead_deleted event", async () => {
    // The source reads the real clock, so the changes are dated after the first round, not on the seed's days.
    const fake = account()
    await sync(fake)
    const now = Date.now()
    const lead = fake.data.leads.find((one) => one.id === 301)
    if (!lead) throw new Error("seed")
    lead.name = "Test lead renamed"
    lead.updated_at = Math.floor(now / 1000) + 5
    // Before the round starts: an event dated after its start is the next round's.
    fake.remove("lead", 304, Math.floor(now / 1000))
    const before = fake.calls.length
    await sync(fake)
    const second = fake.calls.slice(before)
    expect(second.some((one) => one.query["filter[updated_at][from]"] !== undefined)).toBe(true)
    const types = second.map((one) => one.query["filter[type][]"]?.join())
    expect(types).toEqual(expect.arrayContaining(["lead_deleted", "lead_restored"]))
    const deals = await listed(fake, ["deals", "list"])
    expect(idsOf(deals)).toEqual(["301", "302"])
    expect(deals.items.find((one) => one.external_id === "301")).toMatchObject({ title: "Test lead renamed" })
  })
})

describe("a colleague's profile on the same account", () => {
  it("reads offline only its own user's deals of the administrator's copy, and search finds none of the rest", async () => {
    const keyring = memoryKeyring({
      "amo-cli:token:work": FAKE_SIGN_IN,
      "amo-cli:token:home": JSON.stringify({
        origin: FAKE_ORIGIN,
        token: FAKE_TOKEN,
        userId: String(FAKE_COLLEAGUE_ID),
      }),
    })
    const fake = account()
    expect((await amo(["work", "sync", "--json"], { account: fake, keyring })).code).toBe(0)
    const as = async (profile: string, args: string[]) => {
      const ran = await amo([profile, ...args, "--offline", "--json"], { account: fake, keyring })
      return { ran, items: ran.code === 0 ? (ran.json().items as Record<string, unknown>[]) : [] }
    }
    const admin = await as("work", ["deals", "list"])
    expect(admin.items.length).toBeGreaterThan(0)
    const colleague = await as("home", ["deals", "list"])
    expect(colleague.ran.code).toBe(0)
    expect(colleague.items).toEqual([])
    const ref = String(admin.items[0]?.ref)
    expect((await as("home", ["deals", "show", ref])).ran.json()).toMatchObject({ error: { code: "not_found" } })
    expect((await as("work", ["search", "all", "Test lead"])).items.length).toBeGreaterThan(0)
    const searched = await as("home", ["search", "all", "Test lead"])
    expect([searched.ran.code, searched.items]).toEqual([0, []])
  })
})

describe("people, organizations and users read live", () => {
  it("lists contacts newest first with phones and e-mails split from the multitext fields", async () => {
    const fake = account()
    const list = await listed(fake, ["people", "list"])
    expect(idsOf(list, "id")).toEqual(["401", "402", "403"])
    const first = list.items.find((one) => one.id === "401")
    expect(first).toMatchObject({
      phones: [{ value: "+7 900 000-00-00", type: "WORK" }],
      emails: [{ value: "person1@example.test", type: "WORK" }],
      organization_ids: ["501"],
      provider_metadata: { "9201": { label: "Примечание", value: "Test note" } },
    })
    const read = fake.calls.filter((one) => one.path === "/api/v4/contacts").at(-1)
    expect(read?.query).toMatchObject({ "order[updated_at]": ["desc"] })
  })

  it("searches by name with query=, and refuses a filter without the add-on", async () => {
    const fake = account({ apiFilter: false })
    const found = await listed(fake, ["organizations", "list", "Company"])
    expect(idsOf(found, "id")).toEqual(["501", "502"])
    expect(fake.calls.filter((one) => one.path === "/api/v4/companies").at(-1)?.query.query).toEqual(["Company"])
    const refused = await amo(["work", "people", "list", "assigned_to:7001", "--json"], { account: fake })
    expect(refused.json()).toMatchObject({ error: { reason: "amo.filters-off" } })
  })

  it("shows a non-administrator a foreign contact without its phones and spends one of the day's views", async () => {
    const fake = account({ admin: false })
    const list = await listed(fake, ["people", "list"])
    const foreign = list.items.find((one) => one.id === "403")
    expect(foreign?.phones).toBeUndefined()
    expect(list.items.find((one) => one.id === "401")?.phones).toBeDefined()
    const shown = (await amo(["work", "people", "show", "403", "--json"], { account: fake })).json()
    expect(shown).toMatchObject({ item: { id: "403", phones: [{ value: "+7 900 000-00-02" }] } })
  })

  it("lists the users for an administrator, and refuses anyone else as amoCRM does", async () => {
    expect(idsOf(await listed(account(), ["users", "list"]), "id")).toEqual(["7001", String(FAKE_COLLEAGUE_ID)])
    const refused = await amo(["work", "users", "list", "--json"], { account: account({ admin: false }) })
    expect(refused.json()).toMatchObject({ error: { reason: "amo.access-denied" } })
  })
})

describe("writes", () => {
  it("creates a deal, moves it, and closes it lost with a loss reason by name", async () => {
    const fake = account()
    await sync(fake)
    const created = await amo(
      [
        "work",
        "deals",
        "create",
        "--title",
        "WireCat test",
        "--pipeline",
        "Продажи",
        "--amount",
        "1500",
        "--currency",
        "RUB",
        "--json",
      ],
      { account: fake },
    )
    expect([created.code, created.err]).toEqual([0, ""])
    const made = fake.data.leads.at(-1)
    expect(made).toMatchObject({ name: "WireCat test", price: 1500, pipeline_id: 5001 })
    const ref = (created.json() as { item: { deal: { ref: string } } }).item.deal.ref
    const moved = await amo(["work", "deals", "move", ref, "Переговоры", "--json"], { account: fake })
    expect([moved.code, moved.err]).toEqual([0, ""])
    expect(made?.status_id).toBe(50012)
    const closed = await amo(["work", "deals", "close", ref, "lost", "--reason", "дорого", "--json"], {
      account: fake,
    })
    expect([closed.code, closed.err]).toEqual([0, ""])
    expect(made).toMatchObject({ status_id: 143, loss_reason_id: 8801 })
    const patches = fake.calls.filter((one) => one.method === "PATCH")
    expect(patches.map((one) => one.path)).toEqual(["/api/v4/leads", "/api/v4/leads"])
  })

  it("offers no deals delete: amoCRM's API has no call that deletes a lead", async () => {
    const ran = await amo(["work", "deals", "delete", "deal:1", "--json"], { account: account() })
    expect(ran.code).not.toBe(0)
  })

  it("creates and renames a contact and a company", async () => {
    const fake = account()
    const person = await amo(["work", "people", "create", "--first-name", "Anna", "--last-name", "Example", "--json"], {
      account: fake,
    })
    expect([person.code, person.err]).toEqual([0, ""])
    expect(fake.data.contacts.at(-1)).toMatchObject({ name: "Anna Example", first_name: "Anna" })
    const company = await amo(["work", "organizations", "create", "--name", "Example LLC", "--json"], { account: fake })
    expect([company.code, company.err]).toEqual([0, ""])
    const id = String(fake.data.companies.at(-1)?.id)
    const renamed = await amo(["work", "organizations", "update", id, "--name", "Example Ltd", "--json"], {
      account: fake,
    })
    expect([renamed.code, renamed.err]).toEqual([0, ""])
    expect(fake.data.companies.at(-1)?.name).toBe("Example Ltd")
  })
})

describe("sync in small runs", () => {
  it("lists the leads once without the add-on, and reads only the clients they name, by id", async () => {
    const fake = account({ apiFilter: false })
    grown(fake, 3)
    await sync(fake)
    expect(reads(fake, "/api/v4/leads")).toHaveLength(1)
    expect([...reads(fake, "/api/v4/contacts"), ...reads(fake, "/api/v4/companies")]).toEqual([])
    expect(reads(fake, "/api/v4/contacts/1002")).toHaveLength(1)
    expect(reads(fake, "/api/v4/contacts/403")).toEqual([])
  })

  it.each([true, false])(
    "goes on where a run of 20 requests stopped, filters %s",
    async (apiFilter) => {
      const fake = account({ apiFilter })
      grown(fake, 40)
      await sync(fake)
      const at = Math.floor(Date.now() / 1000) + 5
      for (const lead of fake.data.leads) lead.updated_at = at
      let state = ""
      for (let run = 0; run < 30 && state !== "complete"; run++) {
        const ran = await amo(["work", "sync", "--max-pages", "20", "--json"], { account: fake })
        if (!ran.out) throw new Error(`${ran.code} ${ran.err.slice(-600)}`)
        state = String((ran.json().item as { state?: string }).state)
      }
      expect(state).toBe("complete")
    },
    60_000,
  )

  it("finishes a changed colleague's company on more old deals than a run of 20 requests reads", async () => {
    const fake = account({ apiFilter: false })
    const [lead] = fake.data.leads
    if (!lead) throw new Error("seed")
    for (let at = 0; at < 30; at++)
      fake.data.leads.push({
        ...lead,
        id: 3000 + at,
        responsible_user_id: FAKE_COLLEAGUE_ID,
        contacts: [],
        companies: [502],
      })
    await sync(fake)
    const company = fake.data.companies.find((one) => one.id === 502)
    if (!company) throw new Error("seed")
    company.updated_at = Math.floor(Date.now() / 1000) + 5
    let state = ""
    let runs = 0
    for (; runs < 10 && state !== "complete"; runs++) {
      const ran = await amo(["work", "sync", "--max-pages", "20", "--json"], { account: fake })
      if (!ran.out) throw new Error(`${ran.code} ${ran.err.slice(-600)}`)
      state = String((ran.json().item as { state?: string }).state)
    }
    expect(state).toBe("complete")
  }, 60_000)

  it("never stores a colleague's changed contact that is on none of the chosen deals", async () => {
    const fake = account()
    await sync(fake)
    const before = await people()
    const [contact] = fake.data.contacts
    if (!contact) throw new Error("seed")
    fake.data.contacts.push({
      ...contact,
      id: 699,
      name: "Colleague Only Client",
      responsible_user_id: FAKE_COLLEAGUE_ID,
      companies: [501],
      updated_at: Math.floor(Date.now() / 1000) + 5,
    })
    await sync(fake)
    await sync(fake)
    expect(await people()).toBe(before)
  })
})
