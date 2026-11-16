import type { Json } from "../amo/json.js"
import type { FakeCall, Handler } from "./fake-amo.js"

type Entity = "leads" | "contacts" | "companies"

/** Kommo tasks-list: one record each task is on, `entity_type` its list's name; types 1 call, 2 meeting (tasks-api). */
export interface FakeTask {
  id: number
  created_by: number
  updated_by: number
  created_at: number
  updated_at: number
  responsible_user_id: number
  group_id: number
  entity_id: number
  entity_type: Entity
  duration: number
  is_completed: boolean
  task_type_id: number
  text: string
  result: { text?: string } | never[]
  complete_till: number
  account_id: number
}

/** Kommo notes-list-entity: `params` by `note_type` (notes-types); a call note carries the client's phone. */
export interface FakeNote {
  id: number
  entity_id: number
  created_by: number
  updated_by: number
  created_at: number
  updated_at: number
  responsible_user_id: number
  group_id: number
  note_type: string
  params: Json
  account_id: number
}

/** Dated around `recent` (seconds), so a first read of the last 90 days finds them. */
export const activitiesSeed = (recent: number, user: number, colleague: number) => {
  const task = (
    id: number,
    type: Entity,
    entity: number,
    owner: number,
    typeId: number,
    text: string,
    done = false,
  ): FakeTask => ({
    id,
    created_by: owner,
    updated_by: owner,
    created_at: recent - 600 + id,
    updated_at: recent + id,
    responsible_user_id: owner,
    group_id: 0,
    entity_id: entity,
    entity_type: type,
    duration: 0,
    is_completed: done,
    task_type_id: typeId,
    text,
    result: done ? { text: "Done" } : [],
    complete_till: recent + 86400,
    account_id: 31000001,
  })
  const note = (id: number, entity: number, owner: number, type: string, params: Json): FakeNote => ({
    id,
    entity_id: entity,
    created_by: owner,
    updated_by: owner,
    created_at: recent - 600 + id,
    updated_at: recent + id,
    responsible_user_id: owner,
    group_id: 0,
    note_type: type,
    params,
    account_id: 31000001,
  })
  return {
    tasks: [
      task(601, "leads", 301, user, 1, "Call back about the offer"),
      task(602, "leads", 303, colleague, 2, "Colleague's meeting"),
      task(603, "contacts", 401, user, 3, "Send the contract", true),
    ],
    notes: {
      leads: [
        note(701, 301, user, "common", { text: "Discussed the price" }),
        note(702, 302, user, "call_out", {
          uniq: "wirecatfake-call-1",
          duration: 60,
          source: "Fake telephony",
          link: "https://example.test/record.mp3",
          phone: "+7 900 000-00-01",
        }),
        note(703, 303, colleague, "common", { text: "Colleague's private note" }),
      ],
      contacts: [
        note(711, 401, user, "common", { text: "Prefers mornings" }),
        note(712, 403, colleague, "common", { text: "Colleague's client note" }),
      ],
      companies: [note(721, 501, user, "service_message", { service: "Fake", text: "Robot text" })],
    } as Record<Entity, FakeNote[]>,
  }
}

/** By `filter[id]` and `filter[updated_at]`, in `order[id]` or `order[updated_at]` (tasks-list, notes-list-entity). */
const updatedIn = <T extends { id: number; updated_at: number }>(
  call: FakeCall,
  all: T[],
  valuesOf: Lists["valuesOf"],
): T[] => {
  const ids = valuesOf(call, "filter[id]")
  const bound = (name: string) => (call.query[name] ? Number(call.query[name]?.[0]) : undefined)
  const from = bound("filter[updated_at][from]") ?? bound("filter[updated_at]")
  const to = bound("filter[updated_at][to]")
  const way = call.query["order[updated_at]"]?.[0] ?? call.query["order[id]"]?.[0]
  const field = call.query["order[updated_at]"] ? "updated_at" : "id"
  return all
    .filter(
      (one) =>
        (!ids.length || ids.includes(String(one.id))) &&
        (from === undefined || one.updated_at >= from) &&
        (to === undefined || one.updated_at <= to),
    )
    .sort((a, b) => (way === "desc" ? -1 : 1) * (a[field] - b[field] || a.id - b.id))
}

/** The fake's own list helpers, passed in so this file imports nothing back from it. */
interface Lists {
  href: (path: string) => string
  page: (call: FakeCall, name: string, all: unknown[], href: string) => Response
  valuesOf: (call: FakeCall, name: string) => string[]
}

export const activityHandlers = (
  data: ReturnType<typeof activitiesSeed>,
  { href, page, valuesOf }: Lists,
): Record<string, Handler> => ({
  "GET /api/v4/tasks": (call) => {
    const type = call.query["filter[entity_type]"]?.[0]
    const entities = valuesOf(call, "filter[entity_id]")
    const done = call.query["filter[is_completed]"]?.[0]
    const all = updatedIn(call, data.tasks, valuesOf).filter(
      (one) =>
        (type === undefined || one.entity_type === type) &&
        (!entities.length || entities.includes(String(one.entity_id))) &&
        (done === undefined || one.is_completed === (done === "1")),
    )
    return page(call, "tasks", all, href("/api/v4/tasks"))
  },
  ...Object.fromEntries(
    (["leads", "contacts", "companies"] as const).map((type) => [
      `GET /api/v4/${type}/notes`,
      (call: FakeCall) => {
        const kinds = valuesOf(call, "filter[note_type]")
        const all = updatedIn(call, data.notes[type], valuesOf).filter(
          (one) => !kinds.length || kinds.includes(one.note_type),
        )
        return page(call, "notes", all, href(`/api/v4/${type}/notes`))
      },
    ]),
  ),
})
