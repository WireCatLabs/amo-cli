import { isCliError } from "@wirecat/cli-base"
import type { CrmActivity, CrmActivityKind, CrmKind } from "@wirecat/cli-core"
import { type CrmCallContext, type CrmPage, crmValues } from "@wirecat/cli-core/crm"
import { ROUTES, type Route } from "../amo/routes.js"
import type { QueryValue } from "../amo/transport.js"
import type { Raw } from "./records.js"

const { fieldOf, id, isRaw, text } = crmValues

/** A row saved while the last round ran, or this computer's clock ahead of the account's, is read again. */
const OVERLAP_MS = 10 * 60_000

const seconds = (ms: number) => Math.floor(ms / 1000)
const msOf = (value: unknown) => (typeof value === "number" && value > 0 ? value * 1000 : null)

const ON: Record<string, CrmKind> = { leads: "deal", contacts: "person", companies: "organization" }

/** tasks-api: `task_type_id` 1 is a call, 2 a meeting; the account's own types are tasks. */
const TASK_KINDS: Record<string, CrmActivityKind> = { "1": "call", "2": "meeting" }

const taskOf = (raw: Raw): CrmActivity | null => {
  const externalId = id(raw.id)
  const entity = id(raw.entity_id)
  const kind = ON[String(raw.entity_type)]
  const updatedAt = msOf(raw.updated_at)
  if (!externalId || !entity || entity === "0" || !kind || updatedAt === null) return null
  const result = isRaw(raw.result) ? text(fieldOf(raw.result, "text")) : null
  return {
    externalId: `task:${externalId}`,
    kind: TASK_KINDS[String(raw.task_type_id)] ?? "task",
    subject: text(raw.text) ?? "",
    body: result,
    dueAt: msOf(raw.complete_till),
    done: raw.is_completed === true,
    assignee: id(raw.responsible_user_id),
    createdAt: msOf(raw.created_at) ?? updatedAt,
    updatedAt,
    on: [{ kind, externalId: entity }],
  }
}

/**
 * A comment keeps its text. A call keeps only its direction: its `params` hold the client's phone and a recording
 * link (notes-types), which would bypass the limits on reading clients' contacts. SMS, service messages, attachments
 * and the rest are left out.
 */
const NOTE_KINDS: Record<string, { kind: CrmActivityKind; subject: string; body: boolean }> = {
  common: { kind: "comment", subject: "", body: true },
  call_in: { kind: "call", subject: "incoming call", body: false },
  call_out: { kind: "call", subject: "outgoing call", body: false },
}

const noteOf =
  (entity: keyof typeof ON) =>
  (raw: Raw): CrmActivity | null => {
    const externalId = id(raw.id)
    const on = id(raw.entity_id)
    const type = NOTE_KINDS[String(raw.note_type)]
    const updatedAt = msOf(raw.updated_at)
    if (!externalId || !on || !type || updatedAt === null) return null
    return {
      externalId: `note:${entity}:${externalId}`,
      kind: type.kind,
      subject: type.subject,
      body: type.body ? text(fieldOf(raw.params, "text")) : null,
      dueAt: null,
      done: true,
      assignee: id(raw.responsible_user_id),
      createdAt: msOf(raw.created_at) ?? updatedAt,
      updatedAt,
      on: [{ kind: ON[entity] as CrmKind, externalId: on }],
    }
  }

const LISTS: readonly { phase: string; route: Route; name: string; of: (raw: Raw) => CrmActivity | null }[] = [
  { phase: "t", route: ROUTES.tasks, name: "tasks", of: taskOf },
  { phase: "l", route: ROUTES.leadNotes, name: "notes", of: noteOf("leads") },
  { phase: "c", route: ROUTES.contactNotes, name: "notes", of: noteOf("contacts") },
  { phase: "o", route: ROUTES.companyNotes, name: "notes", of: noteOf("companies") },
]
/** After the lists: the round's `task_deleted` events (events-and-notes, the table of event types). */
const DELETIONS = "e"
const PHASES = [...LISTS.map((one) => one.phase), DELETIONS]

/** The largest page of tasks and notes (tasks-api, events-and-notes), and of events on the ru page. */
const LARGEST = 250
const EVENTS_PAGE = 100

/**
 * A task deleted in amoCRM is named on nothing: cli-core then lets go of the copy's one, as of one that left every
 * kept deal. Its other fields are never stored.
 */
const deletedTask = (raw: Raw): CrmActivity | null => {
  const externalId = id(raw.entity_id)
  const at = msOf(raw.created_at)
  if (!externalId || at === null) return null
  return {
    externalId: `task:${externalId}`,
    kind: "task",
    subject: "",
    done: true,
    createdAt: at,
    updatedAt: at,
    on: [],
  }
}

export type ListPage = (
  route: Route,
  name: string,
  query: Record<string, QueryValue>,
) => Promise<{ rows: Raw[]; more: boolean }>

export interface ActivityRead {
  since: number
  page?: string
  now: number
  /** Rows a request asks while windows are searched. */
  size: number
  /** The events filter for these types, in the form the account's host takes. */
  types: (types: readonly string[]) => Record<string, QueryValue>
}

/** A list the account will not read for this sign-in, or whose `updated_at` filter it refuses: the others still run. */
const refusedList = (error: unknown) =>
  isCliError(error) &&
  ((error.code === "permission_error" && error.details?.reason !== "amo.blocked") ||
    (error.code === "validation_error" &&
      (Array.isArray(error.details?.fields) ? error.details.fields : []).some((field) =>
        String(field).startsWith("filter["),
      )))

/**
 * The next window from the rows a fitted one held: about 85 rows in a hundred of a page at the same rate, so a steady list
 * costs one request a page, at most four times as wide, so a quiet stretch costs few.
 */
const widthAfter = (width: number, rows: number, size: number) =>
  Math.max(0, Math.min(4 * (width + 1), Math.floor(((width + 1) * size * 0.85) / Math.max(rows, 1))) - 1)

const once = (items: CrmActivity[]) => [...new Map(items.map((one) => [one.externalId, one])).values()]

/**
 * One call of a round over tasks and notes changed since `since`, then the round's task deletions, at
 * `<phase><from>.<width>.<page>@<round start>`. Each call reads one window of `updated_at` seconds, `[from, from +
 * width]`, sent one second wider at both ends since amoCRM does not say whether a bound takes its own second.
 * - A window that holds more than a page is halved and read again; one that fits moves on, sized by the rows it held.
 *   A window is read on one page, so a row deleted or changed between two calls cannot move an unread row past the
 *   cursor, as page numbers would.
 * - A single second that holds more than a page is read whole in the one call, page after page at the largest size.
 *   A budget stop inside it keeps the cursor at its start: the next run repeats it.
 * - Deletions come from `task_deleted` events created in the round's window, which never change once written, so their
 *   pages keep their place.
 */
export const readActivities = async (
  list: ListPage,
  { since, page, now, size, types }: ActivityRead,
  context?: CrmCallContext,
): Promise<CrmPage<CrmActivity>> => {
  const parsed = /^([a-z])(\d+)\.(\d+)\.(\d+)@(\d+)$/.exec(page ?? "")
  // A cursor no phase reads starts the round again: a repeat, never a skip.
  const found = parsed && PHASES.includes(parsed[1] ?? "") ? parsed : null
  const started = found ? Number(found[5]) : now
  const end = seconds(started)
  const first = seconds(since - OVERLAP_MS)
  const at = found ? PHASES.indexOf(found[1] ?? "") : 0
  const spot = found
    ? { x: Number(found[2]), w: Number(found[3]), p: Number(found[4]) }
    : { x: first, w: Math.max(0, end - first), p: 1 }
  const cursorOf = (index: number, x: number, w: number, p: number) =>
    `${PHASES[index]}${x}.${Math.max(0, Math.min(w, end - x))}.${p}@${started}`
  const next = (items: CrmActivity[], index: number, x: number, w: number): CrmPage<CrmActivity> => {
    if (index < LISTS.length && x <= end)
      return { items: once(items), hasMore: true, nextCursor: cursorOf(index, x, w, 1) }
    if (index + 1 < LISTS.length) return next(items, index + 1, first, Math.max(0, end - first))
    if (index + 1 === LISTS.length)
      return { items: once(items), hasMore: true, nextCursor: cursorOf(LISTS.length, first, 0, 1) }
    return { items: once(items), hasMore: false, cursor: String(started) }
  }
  const gap = (route: string) =>
    context?.gap({ kind: "activities", message: `amoCRM refused the ${route} list to this sign-in: none was read` })

  if (PHASES[at] === DELETIONS) {
    try {
      const { rows, more } = await list(ROUTES.events, "events", {
        ...types(["task_deleted"]),
        "filter[created_at][from]": first - 1,
        "filter[created_at][to]": end + 1,
        limit: EVENTS_PAGE,
        page: spot.p,
      })
      const items = once(rows.flatMap((raw) => deletedTask(raw) ?? []))
      if (more && rows.length > 0) return { items, hasMore: true, nextCursor: cursorOf(at, first, 0, spot.p + 1) }
      return { items, hasMore: false, cursor: String(started) }
    } catch (error) {
      if (!refusedList(error)) throw error
      gap(ROUTES.events)
      return { items: [], hasMore: false, cursor: String(started) }
    }
  }

  const one = LISTS[at] as (typeof LISTS)[number]
  const to = Math.min(spot.x + spot.w, end)
  const query = (limit: number, number: number) => ({
    "filter[updated_at][from]": spot.x - 1,
    "filter[updated_at][to]": to + 1,
    "order[id]": "asc",
    limit,
    page: number,
  })
  try {
    if (spot.w > 0) {
      const { rows, more } = await list(one.route, one.name, query(size, 1))
      const items = rows.flatMap((raw) => one.of(raw) ?? [])
      if (more && rows.length > 0) return next(items, at, spot.x, Math.floor(spot.w / 2))
      return next(items, at, to + 1, widthAfter(spot.w, rows.length, size))
    }
    const items: CrmActivity[] = []
    for (let number = 1; ; number++) {
      const { rows, more } = await list(one.route, one.name, query(LARGEST, number))
      for (const raw of rows) {
        const item = one.of(raw)
        if (item) items.push(item)
      }
      if (!more || rows.length === 0) return next(items, at, to + 1, 1)
    }
  } catch (error) {
    if (!refusedList(error)) throw error
    gap(one.route)
    return next([], at, end + 1, 0)
  }
}
