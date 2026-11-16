import type { CrmActivity } from "@wirecat/cli-core"
import type { CrmCallContext, CrmGap } from "@wirecat/cli-core/crm"
import { describe, expect, it } from "vitest"
import { AmoTransport } from "../amo/transport.js"
import { FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID, type FakeAmo, fakeAmo } from "../testing/fake-amo.js"
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
const round = async (account: FakeAmo, options: { page?: number; since?: number; between?: () => void } = {}) => {
  const items: CrmActivity[] = []
  const gaps: Pick<CrmGap, "kind" | "message">[] = []
  let page: string | undefined
  for (let calls = 0; calls < 500; calls++) {
    const answer = await sourceOf(account, options.page).activities?.(options.since ?? SINCE, page, contextOf(gaps))
    if (!answer) throw new Error("no activities")
    items.push(...answer.items)
    if (!answer.hasMore) return { items, gaps, cursor: answer.cursor, calls: calls + 1 }
    page = answer.nextCursor
    options.between?.()
  }
  throw new Error("the round never ended")
}

const fake = () => fakeAmo({ perSecond: 10_000, now: () => NOW })
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

  it("reads from ten minutes before the last read, to the round's start", async () => {
    const account = fake()
    const since = NOW - 3_600_000
    await round(account, { since })
    const tasks = account.calls.filter((one) => one.path === "/api/v4/tasks")
    expect(tasks[0]?.query["filter[updated_at][from]"]).toEqual([String(Math.floor((since - 600_000) / 1000))])
    expect(tasks.at(-1)?.query["filter[updated_at][to]"]).toEqual([String(Math.floor(NOW / 1000))])
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
