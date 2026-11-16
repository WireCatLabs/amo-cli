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

export type ListPage = (
  route: Route,
  name: string,
  query: Record<string, QueryValue>,
) => Promise<{ rows: Raw[]; more: boolean }>

/**
 * One request of a round over tasks and notes changed since `since`, at `<list><from>.<width>.<page>@<round start>`.
 * Each request reads a window of `updated_at` seconds, `[from, from + width]`, ending at the round's start, whole on
 * one page: a window that holds more than a page is halved and read again, and one that fits moves on and doubles.
 * Rows deleted or changed between runs then never shift an unread row past the cursor, as page numbers would; a row
 * read twice is only saved twice. Only a single second that holds more than a page is paged.
 */
export const readActivities = async (
  list: ListPage,
  { since, page, now, size }: { since: number; page?: string; now: number; size: number },
  context?: CrmCallContext,
): Promise<CrmPage<CrmActivity>> => {
  const found = /^([a-z])(\d+)\.(\d+)\.(\d+)@(\d+)$/.exec(page ?? "")
  const started = found ? Number(found[5]) : now
  const end = seconds(started)
  const first = seconds(since - OVERLAP_MS)
  const at = found ? LISTS.findIndex((one) => one.phase === found[1]) : 0
  const spot = found
    ? { x: Number(found[2]), w: Number(found[3]), p: Number(found[4]) }
    : { x: first, w: Math.max(0, end - first), p: 1 }
  const one = LISTS[at]
  const next = (items: CrmActivity[], index: number, x: number, w: number, p: number): CrmPage<CrmActivity> => {
    if (x <= end) {
      const phase = LISTS[index]?.phase ?? ""
      return { items, hasMore: true, nextCursor: `${phase}${x}.${Math.min(w, end - x)}.${p}@${started}` }
    }
    return index + 1 < LISTS.length
      ? next(items, index + 1, first, Math.max(0, end - first), 1)
      : { items, hasMore: false, cursor: String(started) }
  }
  if (!one) return next([], LISTS.length, end + 1, 0, 1)
  const to = Math.min(spot.x + spot.w, end)
  let rows: Raw[]
  let more: boolean
  try {
    ;({ rows, more } = await list(one.route, one.name, {
      "filter[updated_at][from]": spot.x,
      "filter[updated_at][to]": to,
      "order[id]": "asc",
      limit: size,
      page: spot.p,
    }))
  } catch (error) {
    if (!isCliError(error) || error.code !== "permission_error" || error.details?.reason === "amo.blocked") throw error
    context?.gap({ kind: "activities", message: `amoCRM refused the ${one.route} list to this sign-in: none was read` })
    return next([], at, end + 1, 0, 1)
  }
  const items = rows.flatMap((raw) => one.of(raw) ?? [])
  if (more && rows.length > 0)
    return spot.w > 0 ? next(items, at, spot.x, Math.floor(spot.w / 2), 1) : next(items, at, spot.x, 0, spot.p + 1)
  return next(items, at, to + 1, spot.w === 0 ? 1 : spot.w * 2, 1)
}
