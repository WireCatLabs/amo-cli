import type { CrmActivity } from "@wirecat/cli-core"
import type { CrmCallContext, CrmGap } from "@wirecat/cli-core/crm"
import { describe, expect, it } from "vitest"
import { AmoTransport } from "../amo/transport.js"
import { FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID, type FakeAmo, fakeAmo } from "../testing/fake-amo.js"
import { type ListPage, readActivities } from "./activities.js"
import { amoCrmSource } from "./source.js"

const NOW = Date.UTC(2026, 10, 16, 12)
const SINCE = NOW - 90 * 86_400_000

/** A source of its own over the fake, as each run of the CLI builds one. */
const sourceOf = (account: FakeAmo, page?: number, now = NOW) =>
  amoCrmSource(
    () =>
      new AmoTransport({
        signIn: { origin: FAKE_ORIGIN, token: FAKE_TOKEN },
        fetch: account.fetch,
        sleep: async () => {},
      }),
    { now: () => now, ...(page ? { page } : {}) },
  )

const contextOf = (gaps: Pick<CrmGap, "kind" | "message">[] = []): CrmCallContext => ({
  scope: { mode: "mine", self: String(FAKE_USER_ID), also: [] },
  spend: () => {},
  gap: (gap) => gaps.push(gap),
})

/** Every page of one round, each from a new source, as runs cut by the budget read it. */
const round = async (
  account: FakeAmo,
  options: { page?: number; since?: number; between?: () => void; seen?: (one: CrmActivity) => void } = {},
) => {
  const items: CrmActivity[] = []
  const gaps: Pick<CrmGap, "kind" | "message">[] = []
  let page: string | undefined
  for (let calls = 0; calls < 2000; calls++) {
    const answer = await sourceOf(account, options.page).activities?.(options.since ?? SINCE, page, contextOf(gaps))
    if (!answer) throw new Error("no activities")
    items.push(...answer.items)
    for (const one of answer.items) options.seen?.(one)
    if (!answer.hasMore) return { items, gaps, cursor: answer.cursor, calls: calls + 1 }
    page = answer.nextCursor
    options.between?.()
  }
  throw new Error("the round never ended")
}

const fake = () => fakeAmo({ perSecond: 100_000, now: () => NOW })
const NOW_S = Math.floor(NOW / 1000)
type Note = FakeAmo["data"]["notes"]["leads"][number]

/** `count` comments on lead 301, the first id `first`, each at the second `at(index)`. */
const notes = (account: FakeAmo, first: number, count: number, at: (index: number) => number) => {
  const [model] = account.data.notes.leads
  if (!model) throw new Error("seed")
  for (let index = 0; index < count; index++)
    account.data.notes.leads.push({ ...model, id: first + index, updated_at: at(index) } as Note)
}

const hal = (name: string, rows: unknown[], more: boolean) =>
  rows.length === 0
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify({ _links: more ? { next: { href: "next" } } : {}, _embedded: { [name]: rows } }), {
        headers: { "content-type": "application/hal+json" },
      })

/** The leads' notes list as an account whose `updated_at` bounds both leave their own second out. */
const exclusive = (account: FakeAmo) => ({
  "GET /api/v4/leads/notes": (call: { query: Record<string, string[]> }) => {
    const from = Number(call.query["filter[updated_at][from]"]?.[0])
    const to = Number(call.query["filter[updated_at][to]"]?.[0])
    const limit = Number(call.query.limit?.[0])
    const page = Number(call.query.page?.[0] ?? 1)
    const all = account.data.notes.leads
      .filter((one) => one.updated_at > from && one.updated_at < to)
      .sort((a, b) => a.id - b.id)
    return hal("notes", all.slice((page - 1) * limit, page * limit), page * limit < all.length)
  },
})
const byId = (items: CrmActivity[]) => Object.fromEntries(items.map((one) => [one.externalId, one]))

describe("amo activities: tasks and notes", () => {
  it("reads tasks and the notes of leads, contacts and companies changed since the last read", async () => {
    const { items, cursor } = await round(fake())
    const found = byId(items)
    expect(Object.keys(found).sort()).toEqual([
      "note:contacts:711",
      "note:contacts:712",
      "note:leads:701",
      "note:leads:702",
      "note:leads:703",
      "task:601",
      "task:602",
      "task:603",
    ])
    expect(found["task:601"]).toMatchObject({
      kind: "call",
      subject: "Call back about the offer",
      done: false,
      assignee: String(FAKE_USER_ID),
      on: [{ kind: "deal", externalId: "301" }],
    })
    expect(found["task:602"]).toMatchObject({ kind: "meeting" })
    expect(found["task:603"]).toMatchObject({
      kind: "task",
      done: true,
      body: "Done",
      on: [{ kind: "person", externalId: "401" }],
    })
    expect(found["note:leads:701"]).toMatchObject({ kind: "comment", body: "Discussed the price", done: true })
    expect(found["note:contacts:711"]).toMatchObject({ on: [{ kind: "person", externalId: "401" }] })
    expect(found["task:601"]?.dueAt).toEqual(expect.any(Number))
    expect(cursor).toBe(String(NOW))
  })

  it("keeps a call note's phone number and recording link out of the activity", async () => {
    const { items } = await round(fake())
    const call = byId(items)["note:leads:702"]
    expect(call).toMatchObject({ kind: "call", subject: "outgoing call", body: null })
    expect(JSON.stringify(items)).not.toMatch(/000-00-01|record\.mp3|wirecatfake-call/)
  })

  it("leaves out service messages and other robot notes", async () => {
    const { items } = await round(fake())
    expect(items.map((one) => one.externalId)).not.toContain("note:companies:721")
  })

  it("splits a window that holds more than a page, and reads every row though rows go between runs", async () => {
    const account = fake()
    const recent = Math.floor(NOW / 1000) - 7200
    for (let at = 0; at < 12; at++)
      account.data.notes.leads.push({
        ...(account.data.notes.leads[0] as FakeAmo["data"]["notes"]["leads"][number]),
        id: 800 + at,
        updated_at: recent + at * 300,
      })
    let removed = false
    const { items } = await round(account, {
      page: 2,
      between: () => {
        // A deletion between runs moves rows of a paged list onto an earlier page; a window read whole never does.
        if (removed) return
        removed = true
        account.data.notes.leads.splice(
          account.data.notes.leads.findIndex((one) => one.id === 800),
          1,
        )
      },
    })
    const ids = new Set(items.map((one) => one.externalId))
    for (let at = 1; at < 12; at++) expect(ids.has(`note:leads:${800 + at}`), `note ${800 + at}`).toBe(true)
    const notes = account.calls.filter((one) => one.path === "/api/v4/leads/notes")
    expect(notes.every((one) => one.query["filter[updated_at][to]"] !== undefined)).toBe(true)
  })

  it("reads a second that holds more than a page whole, so a row deleted between runs hides no other", async () => {
    const busy = NOW_S - 5000
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: 2000 + index,
      entity_id: 301,
      updated_at: busy,
      note_type: "common",
      params: { text: "Busy second" },
    }))
    const list: ListPage = async (route, _name, query) => {
      if (route !== "GET /api/v4/leads/notes") return { rows: [], more: false }
      const from = Number(query["filter[updated_at][from]"])
      const to = Number(query["filter[updated_at][to]"])
      const limit = Number(query.limit)
      const page = Number(query.page)
      const all = rows.filter((one) => one.updated_at >= from && one.updated_at <= to)
      return { rows: all.slice((page - 1) * limit, page * limit), more: page * limit < all.length }
    }
    const seen = new Set<string>()
    const cursors: string[] = []
    let page: string | undefined
    for (let calls = 0; calls < 500; calls++) {
      const answer = await readActivities(list, {
        since: SINCE,
        now: NOW,
        size: 10,
        types: (one) => ({ "filter[type]": one.join(",") }),
        ...(page ? { page } : {}),
      })
      for (const one of answer.items) seen.add(one.externalId)
      if (!answer.hasMore) break
      page = answer.nextCursor ?? ""
      cursors.push(page)
      // A row of the second's first page goes once a run has paged into it.
      if (/^l\d+\.0\.2@/.test(page) && rows[0]?.id === 2000) rows.shift()
    }
    expect(rows.filter((one) => !seen.has(`note:leads:${one.id}`)).map((one) => one.id)).toEqual([])
    expect(cursors.filter((one) => /^[tlco]\d+\.\d+\.([2-9]|\d\d+)@/.test(one))).toEqual([])
  })

  it("reads every row when amoCRM leaves out both bounds' own seconds", async () => {
    const account = fake()
    const routed = fakeAmo({ perSecond: 100_000, now: () => NOW, routes: exclusive(account) })
    notes(account, 3000, 400, (index) => NOW_S - 20_000 + index)
    for (let index = 0; index < 1000; index++)
      account.data.notes.leads.push({
        ...(account.data.notes.leads[0] as Note),
        id: 6000 + ((index * 7919) % 1000),
        updated_at: NOW_S - 30_000 + Math.floor(index / 5),
      })
    const { items } = await round(routed, { page: 50 })
    const ids = new Set(items.map((one) => one.externalId))
    const want = account.data.notes.leads.filter((one) => one.updated_at <= NOW_S).map((one) => `note:leads:${one.id}`)
    expect(want.filter((one) => !ids.has(one))).toEqual([])
  })

  it("reads 5000 notes over 89 days in close to one request a page", async () => {
    const account = fake()
    notes(account, 5000, 5000, (index) => NOW_S - 86_400 * 89 + index * 1500)
    const { items } = await round(account)
    expect(items.filter((one) => one.externalId.startsWith("note:leads:")).length).toBeGreaterThanOrEqual(5000)
    const reads = account.calls.filter((one) => one.path === "/api/v4/leads/notes").length
    expect(reads).toBeLessThanOrEqual(32)
  })

  it("names a tasks list refused for its filter as a gap, and still reads the notes", async () => {
    const refused = () =>
      new Response(
        JSON.stringify({
          title: "Bad Request",
          status: 400,
          detail: "filters are off",
          "validation-errors": [
            { request_id: "0", errors: [{ code: "FilterDisabled", path: "filter[updated_at][from]", detail: "off" }] },
          ],
        }),
        { status: 400, headers: { "content-type": "application/problem+json" } },
      )
    const account = fakeAmo({ perSecond: 100_000, now: () => NOW, routes: { "GET /api/v4/tasks": refused } })
    const { items, gaps } = await round(account)
    expect(gaps).toEqual([expect.objectContaining({ kind: "activities" })])
    expect(items.map((one) => one.externalId)).toContain("note:leads:701")
  })

  it("names a task deleted in amoCRM from its task_deleted event, so the copy lets it go", async () => {
    const account = fake()
    const [first] = account.data.events
    if (!first) throw new Error("seed")
    account.data.events.push({
      ...first,
      id: "01fakeevent0601",
      type: "task_deleted",
      entity_id: 650,
      entity_type: "task",
      created_at: NOW_S - 60,
    })
    const { items } = await round(account, { since: NOW - 3_600_000 })
    expect(byId(items)["task:650"]).toMatchObject({ on: [] })
  })

  it("starts the round again from a cursor it cannot read, rather than skip it", async () => {
    const answer = await sourceOf(fake()).activities?.(SINCE, `z1.1.1@${NOW}`, contextOf())
    expect(answer).toMatchObject({ hasMore: true })
  })

  it("reads from ten minutes before the last read, to the round's start, one second wider", async () => {
    const account = fake()
    const since = NOW - 3_600_000
    await round(account, { since })
    const tasks = account.calls.filter((one) => one.path === "/api/v4/tasks")
    // One second wider at both ends: amoCRM does not say whether a bound takes its own second.
    expect(tasks[0]?.query["filter[updated_at][from]"]).toEqual([String(Math.floor((since - 600_000) / 1000) - 1)])
    expect(tasks.at(-1)?.query["filter[updated_at][to]"]).toEqual([String(Math.floor(NOW / 1000) + 1)])
  })

  it("names a list the sign-in may not read as a gap, and still reads the others", async () => {
    const refused = () =>
      new Response(JSON.stringify({ title: "Forbidden", status: 403, detail: "Access denied" }), {
        status: 403,
        headers: { "content-type": "application/problem+json" },
      })
    const account = fakeAmo({ perSecond: 10_000, now: () => NOW, routes: { "GET /api/v4/contacts/notes": refused } })
    const { items, gaps } = await round(account)
    expect(gaps).toEqual([expect.objectContaining({ kind: "activities" })])
    expect(items.map((one) => one.externalId)).toContain("note:leads:701")
    expect(items.some((one) => one.externalId.startsWith("note:contacts:"))).toBe(false)
  })
})
