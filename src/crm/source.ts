import { CliError, isCliError } from "@wirecat/cli-base"
import type { CrmField, CrmItem, CrmKind, CrmRecords, CrmStageEntry } from "@wirecat/cli-core"
import {
  type CrmCallContext,
  type CrmChanges,
  type CrmCondition,
  type CrmLiveKind,
  type CrmLiveQuery,
  type CrmPage,
  type CrmSource,
  crmValues,
} from "@wirecat/cli-core/crm"
import { matchOperation } from "../amo/operation.js"
import { type AmoKind, ENTITIES, ROUTES, type Route } from "../amo/routes.js"
import type { AmoRequest, AmoTransport, QueryValue } from "../amo/transport.js"
import { readActivities } from "./activities.js"
import { fieldOfRaw, type Raw, toDeal, toOrganization, toPerson, toPipeline, toUser } from "./records.js"

const { fieldOf, id, isRaw, rawsOf, text } = crmValues

/**
 * Re-read before the last cursor: rows amoCRM saved while the round ran, and this computer's clock running ahead of
 * the account's. A row read twice is only saved twice.
 */
const OVERLAP_MS = 10 * 60_000
/** The largest page of leads, contacts, companies and users (leads-api, contacts-api, companies-api, users-api). */
const PAGE = 250
/** events-and-notes says 100 on the ru page, Kommo 250: the smaller. */
const EVENTS_PAGE = 100
/** Ids in one `filter[id][]`: amoCRM recommends 50 records a request (amocrm.ru "Рекомендации"). */
const CHUNK = 50

const seconds = (ms: number) => Math.floor(ms / 1000)

interface Caller {
  request(request: AmoRequest): Promise<{ status: number; body: unknown }>
}

interface Account {
  userId: string
  /** `is_api_filter_enabled` (account-info): the paid add-on `filter[…]` on leads, contacts and companies needs. */
  filters: boolean
  /** A lead has no currency of its own; the account's is every amount's (account-info). */
  currency: string | null
}

/** One list page: its rows in `_embedded.<name>`, and whether `_links.next` says more come (leads-api). 204 is empty. */
const listPage = async (caller: Caller, route: Route, name: string, query: Record<string, QueryValue>) => {
  const { body } = await caller.request({ route, query })
  if (body === undefined) return { rows: [] as Raw[], more: false }
  const rows = fieldOf(fieldOf(body, "_embedded"), name)
  // A list answer without its rows would read as an empty page and end the round.
  if (!Array.isArray(rows)) throw new CliError("invalid_response", `amoCRM answered ${route} without its ${name}`)
  return { rows: rows.filter(isRaw), more: fieldOf(fieldOf(body, "_links"), "next") !== undefined }
}

const readAll = async (caller: Caller, route: Route, name: string, query: Record<string, QueryValue> = {}) => {
  const all: Raw[] = []
  for (let page = 1; ; page++) {
    const { rows, more } = await listPage(caller, route, name, { ...query, limit: PAGE, page })
    for (const raw of rows) all.push(raw)
    if (!more || rows.length === 0) return all
  }
}

const readOne = async (caller: Caller, route: Route, externalId: string, query: Record<string, QueryValue> = {}) => {
  if (!/^\d{1,20}$/.test(externalId)) return null
  try {
    const { body } = await caller.request({ route, ids: { id: externalId }, query })
    return isRaw(body) ? body : null
  } catch (error) {
    if (isCliError(error) && error.code === "not_found") return null
    throw error
  }
}

/**
 * Where a round stands, `<phase><page>.<offset>[.<sub>][~<id>]@<when the round started>`: the phase (`d` deals, `w`
 * the clients on the chosen users' leads, `c` changed clients, `n` the clients on changed leads, `a` every client, `r`
 * deletions, `s` restores), the page, and how far into it. A call the run's budget cuts answers what it read and this
 * place, so the next run goes on from there (WC-LIFE-12).
 *
 * `id` is the last row done; with `sub`, the row under way, whose linked ids up to `sub` (in id order) are read. The
 * next run finds the row by its id, on its page or the pages before it, so a row deleted or moved between runs makes
 * it repeat rows, never skip one.
 */
interface Spot {
  ph: string
  p: number
  o: number
  l?: number
  k?: string
}
const spotOf = (page: string | undefined, now: number) => {
  const found = /^([a-z])(\d+)\.(\d+)(?:\.(\d+))?(?:~(\d+))?@(\d+)$/.exec(page ?? "")
  if (!found) return { spot: null, started: now }
  const spot: Spot = { ph: found[1] ?? "", p: Number(found[2]), o: Number(found[3]) }
  if (found[4] !== undefined) spot.l = Number(found[4])
  if (found[5] !== undefined) spot.k = found[5]
  return { spot, started: Number(found[6]) }
}
const keyOf = (spot: Spot) =>
  `${spot.ph}${spot.p}.${spot.o}${spot.l === undefined ? "" : `.${spot.l}`}${spot.k === undefined ? "" : `~${spot.k}`}`

const byNumber = (ids: Iterable<string>) => [...new Set(ids)].sort((a, b) => Number(a) - Number(b))

/** The run's budget said no inside a call: the call answers what it has read so far. */
class Cut extends Error {}

/** The users whose deals a `mine` scope copies: the chosen ones, else the signed-in user (b24's ruling 2026-11-12). */
const chosenOf = (context?: CrmCallContext): string[] | null => {
  const scope = context?.scope
  if (scope?.mode !== "mine") return null
  return [...(scope.also.length ? scope.also : [scope.self])]
}

const ownerOf = (raw: Raw) => id(raw.responsible_user_id) ?? ""
const linkedIds = (raw: Raw, key: string) => rawsOf(fieldOf(raw._embedded, key)).flatMap((one) => id(one.id) ?? [])

const WITH: Record<AmoKind, string> = { deal: "contacts,loss_reason", person: "leads", organization: "leads,contacts" }

/** A live list's conditions as amoCRM's `filter[…]` (filters-api); one the operation does not declare is refused. */
const filtersOf = (kind: CrmLiveKind, conditions: readonly CrmCondition[]): Record<string, QueryValue> => {
  const declared = new Set(matchOperation(ENTITIES[kind].list).operation.query)
  const query: Record<string, QueryValue> = {}
  const set = (name: string, value: QueryValue) => {
    if (!declared.has(name))
      throw new CliError("validation_error", `amoCRM cannot filter ${ENTITIES[kind].name} by ${name}`, {
        reason: "crm.record-field",
      })
    query[name] = value
  }
  for (const { field, op, value } of conditions) {
    if (field === "assigned_to" && (op === "=" || op === "in")) {
      set("filter[responsible_user_id][]", (Array.isArray(value) ? value : [value]).map(Number))
      continue
    }
    if ((field === "created_at" || field === "updated_at") && typeof value === "number" && op !== "!=" && op !== "in") {
      const ms = value
      // amoCRM keeps whole seconds: `=` names the second the time falls in.
      if (op === "=" || op === ">=" || op === ">")
        set(`filter[${field}][from]`, op === ">" ? seconds(ms) + 1 : op === "=" ? seconds(ms) : Math.ceil(ms / 1000))
      if (op === "=" || op === "<=" || op === "<")
        set(`filter[${field}][to]`, op === "<" ? Math.ceil(ms / 1000) - 1 : seconds(ms))
      continue
    }
    throw new CliError("validation_error", `amoCRM cannot filter ${ENTITIES[kind].name} by ${field} ${op}`, {
      reason: "crm.record-field",
    })
  }
  return query
}

export interface AmoCrmSource extends CrmSource {
  /** One lead as amoCRM holds it now, its contacts and loss reason included: what a write answers. */
  item(externalId: string): Promise<CrmItem>
  fields(kind: CrmKind, context?: CrmCallContext): Promise<CrmField[]>
  account(): Promise<Account>
  lossReasons(): Promise<{ id: string; name: string }[]>
}

export interface AmoSourceOptions {
  now?: () => number
  /** The stored `scope` setting, its key and the chosen users' key: a sync under `all` is refused. */
  asked?: () => Promise<{ mode: "mine" | "all"; setting: string; chosen: string }>
  /** Rows a sync asks per page; a test pages over a small account with a smaller one. */
  page?: number
}

/**
 * The account's CRM for core's sync: leads, contacts and companies by `filter[updated_at]` when the account has the
 * API filter add-on, else by `order[updated_at]=desc` down to the last round (research §3, §9.5); deletions and
 * stage moves from the events list. A `mine` round copies the chosen users' leads and their clients only.
 */
export const amoCrmSource = (account: () => AmoTransport, options: AmoSourceOptions = {}): AmoCrmSource => {
  const now = options.now ?? Date.now
  const size = options.page ?? PAGE
  const asked = options.asked ?? (async () => ({ mode: "mine" as const, setting: "scope", chosen: "unassigned" }))
  /**
   * core paid for a call's first request; each further one is spent from the run's budget. With `cut`, a spent budget
   * is a `Cut` the call catches, and `spent()` the reason it rethrows when it read nothing.
   */
  const metered = (context?: CrmCallContext, cut = false) => {
    let paid = false
    let spent: unknown
    const caller: Caller = {
      request: (request) => {
        if (paid && context)
          try {
            context.spend()
          } catch (error) {
            if (!cut) throw error
            spent = error
            throw new Cut()
          }
        paid = true
        return account().request(request)
      },
    }
    return Object.assign(caller, { spent: () => spent })
  }
  let about: Promise<Account> | undefined
  const accountOf = (caller: Caller = account()) =>
    (about ??= caller.request({ route: ROUTES.account, query: { with: "is_api_filter_enabled" } }).then(({ body }) => ({
      userId: id(fieldOf(body, "current_user_id")) ?? "",
      filters: fieldOf(body, "is_api_filter_enabled") === true,
      currency: text(fieldOf(body, "currency")),
    })))
  const loaded = new Map<CrmKind, Promise<CrmField[]>>()
  const fields = (kind: CrmKind, caller: Caller = account()) => {
    let found = loaded.get(kind)
    if (!found) {
      if (kind === "lead") return Promise.resolve([])
      found = readAll(caller, ENTITIES[kind].fields, "custom_fields").then((rows) =>
        rows.map(fieldOfRaw).filter((one): one is CrmField => one !== null),
      )
      found.catch(() => loaded.delete(kind))
      loaded.set(kind, found)
    }
    return found
  }
  const mapped = async <K extends CrmKind>(kind: K, rows: Raw[], caller: Caller): Promise<CrmRecords[K][]> => {
    const defined = await fields(kind, caller)
    const { currency } = await accountOf(caller)
    const map = { deal: toDeal, lead: toDeal, person: toPerson, organization: toOrganization }[kind]
    return rows.map((raw) => map(raw, defined, currency)) as CrmRecords[K][]
  }

  /** Each lead's responsible user, as far as a round has seen; one not seen yet is read by id. */
  const owners = new Map<string, string>()
  const remember = (rows: Raw[]) => {
    for (const raw of rows) {
      const lead = id(raw.id)
      if (lead) owners.set(lead, ownerOf(raw))
    }
  }
  /** Reads by id: `filter[id][]` with the add-on, else one record a request. */
  const byIds = async (caller: Caller, kind: AmoKind, ids: readonly string[], query: Record<string, QueryValue>) => {
    const { filters } = await accountOf(caller)
    const rows: Raw[] = []
    for (let at = 0; at < ids.length; at += CHUNK) {
      const chunk = ids.slice(at, at + CHUNK)
      if (filters) {
        const page = await listPage(caller, ENTITIES[kind].list, ENTITIES[kind].name, {
          ...query,
          "filter[id][]": chunk.map(Number),
          limit: CHUNK,
        })
        for (const raw of page.rows) rows.push(raw)
      } else
        for (const externalId of chunk) {
          const raw = await readOne(caller, ENTITIES[kind].one, externalId, query)
          if (raw) rows.push(raw)
        }
    }
    return rows
  }
  const ownersOf = async (caller: Caller, leads: readonly string[]) => {
    const missing = [...new Set(leads)].filter((lead) => !owners.has(lead))
    remember(await byIds(caller, "deal", missing, {}))
    for (const lead of missing) if (!owners.has(lead)) owners.set(lead, "")
  }
  /** One request's worth of records by id: a `filter[id][]` chunk with the add-on, else one record. */
  const readSome = async (caller: Caller, kind: AmoKind, ids: readonly string[], query: Record<string, QueryValue>) => {
    const { filters } = await accountOf(caller)
    const chunk = ids.slice(0, filters ? CHUNK : 1)
    return { read: chunk.length, rows: await byIds(caller, kind, chunk, query) }
  }
  /** One request towards the owners of leads no page has shown yet; false when none is left to read. */
  const resolveOwners = async (caller: Caller, leads: readonly string[]) => {
    const missing = [...new Set(leads)].filter((lead) => !owners.has(lead))
    if (missing.length === 0) return false
    const { read, rows } = await readSome(caller, "deal", missing, {})
    remember(rows)
    for (const lead of missing.slice(0, read)) if (!owners.has(lead)) owners.set(lead, "")
    return true
  }

  /**
   * Leads of one round, oldest id first; or, after a cursor, changed since `from`: by `filter[updated_at][from]` with
   * the add-on, else newest first until a row older than `from` (the order is documented on each entity page).
   */
  const round = async (
    caller: Caller,
    kind: AmoKind,
    at: number,
    from: number | null,
    extra: Record<string, QueryValue> = {},
  ) => {
    const { filters } = await accountOf(caller)
    const base = { with: WITH[kind], limit: size, page: at, ...extra }
    const entity = ENTITIES[kind]
    if (from === null || filters) {
      const query = from === null ? base : { ...base, "filter[updated_at][from]": from }
      return listPage(caller, entity.list, entity.name, { ...query, "order[id]": "asc" })
    }
    const { rows, more } = await listPage(caller, entity.list, entity.name, { ...base, "order[updated_at]": "desc" })
    const recent = rows.filter((raw) => Number(raw.updated_at) >= from)
    return { rows: recent, more: more && recent.length === rows.length }
  }

  /**
   * One page of the leads a round reads: in a full `mine` round only the chosen users' (narrowed by the add-on, else
   * kept from every lead), after a cursor every changed one, as core drops a lead given away by its assignee. The
   * clients' rounds of a full round walk the same pages before the deals', so it lists each lead page once (research §4
   * counts an account enumerated over and over as a cause of a block).
   */
  const leadPages = new Map<string, { at: number; page: Promise<{ rows: Raw[]; more: boolean }> }>()
  const leadPage = (caller: Caller, at: number, from: number | null, chosen: readonly string[] | null) => {
    const key = `${at}|${from ?? ""}|${chosen?.join(",") ?? ""}`
    const kept = leadPages.get(key)
    if (kept && now() - kept.at < OVERLAP_MS) return kept.page
    const page = (async () => {
      const { filters } = await accountOf(caller)
      const narrow: Record<string, QueryValue> =
        from === null && chosen && filters ? { "filter[responsible_user_id][]": chosen.map(Number) } : {}
      const { rows, more } = await round(caller, "deal", at, from, narrow)
      remember(rows)
      return { rows: from === null && chosen ? rows.filter((raw) => chosen.includes(ownerOf(raw))) : rows, more }
    })()
    page.catch(() => leadPages.delete(key))
    leadPages.set(key, { at: now(), page })
    return page
  }

  /** The clients of a round already read in this process, so one on many leads is read once. */
  const seen = new Map<string, Set<string>>()
  const seenOf = (kind: CrmKind, started: number) => {
    const key = `${kind}@${started}`
    const found = seen.get(key) ?? new Set<string>()
    seen.set(key, found)
    return found
  }

  /**
   * The event types to list: Kommo's events-list takes a comma string in `filter[type]`, amoCRM.ru's events-and-notes
   * an array; neither page names a form both take, so each host gets its own reference's.
   */
  const typesOf = (types: readonly string[]): Record<string, QueryValue> =>
    new URL(account().origin).hostname.endsWith(".amocrm.ru")
      ? { "filter[type][]": types }
      : { "filter[type]": types.join(",") }

  const isAdmin = () => account().isAdmin()

  return {
    provider: "amocrm",
    traits: { kinds: ["organization", "person", "deal"], removedInChanges: true },
    account: () => accountOf(),
    // As b24 (owner's ruling 2026-11-10): a copy is never the whole account, an administrator's included.
    async self() {
      const { mode, setting, chosen } = await asked()
      if (mode === "mine") return (await accountOf()).userId
      throw new CliError(
        "configuration_error",
        `${setting} is all, and amo never copies the whole CRM: "config set ${setting} mine" copies the deals of ` +
          `the users you choose in ${chosen}, and their clients. Find any other client with "people list" or ` +
          '"organizations list"',
        { setting, reason: "amo.scope-all-refused" },
      )
    },
    // Only an administrator may copy a colleague's deals: anyone else cannot list the users to tell who is who.
    async unassigned(users) {
      if (await isAdmin()) return { kept: [...users] }
      const self = (await accountOf()).userId
      return {
        kept: users.filter((user) => user === self),
        message: "another user; only an amoCRM administrator may copy a colleague's deals",
      }
    },
    async pipelines(_kind, context) {
      const rows = await listPage(metered(context), ROUTES.pipelines, "pipelines", {})
      return rows.rows.map(toPipeline).filter((one) => one !== null)
    },
    fields: (kind, context) => fields(kind, metered(context)),
    async changes<K extends CrmKind>(
      kind: K,
      cursor: string | null,
      page?: string,
      context?: CrmCallContext,
    ): Promise<CrmChanges<CrmRecords[K]>> {
      const since = cursor === null ? null : Date.parse(cursor)
      if (since !== null && Number.isNaN(since)) return { reset: true }
      if (kind === "lead") return { items: [], hasMore: false, cursor: null }
      const amoKind = kind as AmoKind
      const caller = metered(context, true)
      const { spot: given, started } = spotOf(page, now())
      const from = since === null ? null : seconds(since - OVERLAP_MS)
      const chosen = chosenOf(context)
      const client = amoKind === "deal" ? null : (amoKind as "person" | "organization")
      const first: Spot = { ph: client === null ? "d" : !chosen ? "a" : from === null ? "w" : "c", p: 1, o: 0 }
      let spot = given ?? first
      // A cut call that moved nothing refuses: core would see the same page twice.
      let progressed = false
      const rows: Raw[] = []
      const removed = new Set<string>()
      const kept = seenOf(kind, started)
      // A fixed window keeps an events page's offsets put across runs (events-list's filter[created_at][to]).
      const window = { "filter[created_at][from]": from ?? 0, "filter[created_at][to]": seconds(started) }
      const answer = async (done: boolean): Promise<CrmChanges<CrmRecords[K]>> => ({
        items: await mapped(kind, rows, caller),
        ...(removed.size ? { removed: [...removed] } : {}),
        hasMore: !done,
        ...(done ? { cursor: new Date(started).toISOString() } : { nextCursor: `${keyOf(spot)}@${started}` }),
      })
      const after = (more: boolean, next: string): boolean => {
        spot = more ? { ph: spot.ph, p: spot.p + 1, o: 0 } : { ph: next, p: 1, o: 0 }
        progressed = true
        return more
      }
      let from_page: number | undefined
      /**
       * Puts a resumed spot after its row, or on it while its `sub` is read. A row not on the page is looked for on
       * the page before; one gone from every page restarts a page before the one it was on. False: read the new page.
       */
      const settle = (ids: readonly string[]): boolean => {
        if (spot.k === undefined) return true
        const at = ids.indexOf(spot.k)
        if (at >= 0) {
          spot = spot.l === undefined ? { ph: spot.ph, p: spot.p, o: at + 1, k: spot.k } : { ...spot, o: at }
          return true
        }
        from_page ??= spot.p
        progressed = true
        if (spot.p > 1) {
          spot = { ...spot, p: spot.p - 1, o: 0 }
          return false
        }
        const restart = Math.max(1, from_page - 1)
        spot = { ph: spot.ph, p: restart, o: 0 }
        return restart === 1
      }
      /** The sub-offset of the row `externalId`: kept only while the spot is still on that row. */
      const subOf = (externalId: string) => (spot.k === externalId && spot.l !== undefined ? spot.l : 0)
      const clientsEnd = client === "person" ? "" : "r"
      try {
        for (;;) {
          if (spot.ph === "") return await answer(true)
          if (spot.ph === "d") {
            const { rows: leads, more } = await leadPage(caller, spot.p, from, chosen)
            for (const raw of leads) rows.push(raw)
            if (after(more, from === null ? "" : "r")) return await answer(false)
            continue
          }
          if (spot.ph === "a" && client) {
            const { rows: found, more } = await round(caller, client, spot.p, from)
            for (const raw of found) rows.push(raw)
            if (after(more && found.length > 0, from === null ? "" : clientsEnd)) return await answer(false)
            continue
          }
          if ((spot.ph === "w" || spot.ph === "n") && client && chosen) {
            const { rows: leads, more } = await leadPage(caller, spot.p, from, chosen)
            const own = leads.filter((raw) => chosen.includes(ownerOf(raw)))
            if (!settle(own.map((raw) => id(raw.id) ?? ""))) continue
            while (spot.o < own.length) {
              const lead = own[spot.o] as Raw
              const leadId = id(lead.id) ?? ""
              const names = byNumber(linkedIds(lead, client === "person" ? "contacts" : "companies"))
              let done = subOf(leadId)
              for (;;) {
                const left = names.filter((one) => Number(one) > done && !kept.has(one))
                if (left.length === 0) break
                spot = { ...spot, l: done, k: leadId }
                const { read, rows: found } = await readSome(caller, client, left, { with: WITH[client] })
                for (const raw of found) rows.push(raw)
                for (const one of left.slice(0, read)) kept.add(one)
                done = Number(left[read - 1])
                spot = { ...spot, l: done, k: leadId }
                progressed = true
                // A page saved now is kept if the process ends before the next answer.
                if (rows.length >= CHUNK) return await answer(false)
              }
              spot = { ph: spot.ph, p: spot.p, o: spot.o + 1, k: leadId }
              progressed = true
            }
            if (after(more, spot.ph === "w" ? "" : clientsEnd)) return await answer(false)
            continue
          }
          if (spot.ph === "c" && client && chosen && from !== null) {
            const { rows: changed, more } = await round(caller, client, spot.p, from)
            if (!settle(changed.map((raw) => id(raw.id) ?? ""))) continue
            while (spot.o < changed.length) {
              const raw = changed[spot.o] as Raw
              const externalId = id(raw.id) ?? ""
              const leads = byNumber(linkedIds(raw, "leads"))
              const ours = () =>
                chosen.includes(ownerOf(raw)) || leads.some((lead) => chosen.includes(owners.get(lead) ?? ""))
              let done = subOf(externalId)
              for (const lead of leads) {
                if (ours()) break
                if (Number(lead) <= done) continue
                if (!owners.has(lead)) {
                  spot = { ...spot, l: done, k: externalId }
                  await resolveOwners(
                    caller,
                    leads.filter((one) => Number(one) >= Number(lead)),
                  )
                  progressed = true
                }
                done = Number(lead)
              }
              // A colleague's client on none of the chosen leads stays out of the copy.
              if (ours()) {
                rows.push(raw)
                kept.add(externalId)
              }
              spot = { ph: spot.ph, p: spot.p, o: spot.o + 1, k: externalId }
              progressed = true
            }
            if (after(more, "n")) return await answer(false)
            continue
          }
          if (spot.ph === "r" && from !== null) {
            const { rows: events, more } = await listPage(caller, ROUTES.events, "events", {
              ...typesOf([`${ENTITIES[amoKind].event}_deleted`]),
              ...window,
              limit: EVENTS_PAGE,
              page: spot.p,
            })
            for (const raw of events) {
              const entity = id(raw.entity_id)
              if (entity) removed.add(entity)
            }
            // Its own answer: core saves an answer's items before it removes its removed, and restores come next.
            after(more && events.length > 0, "s")
            return await answer(false)
          }
          if (spot.ph === "s" && from !== null) {
            // The events list has no documented order (events-and-notes, events-list): a record restored in the
            // window is read as it is now, after every deletion this round named, so the newest state wins.
            const { rows: events, more } = await listPage(caller, ROUTES.events, "events", {
              ...typesOf([`${ENTITIES[amoKind].event}_restored`]),
              ...window,
              limit: EVENTS_PAGE,
              page: spot.p,
            })
            const back = byNumber(events.flatMap((raw) => id(raw.entity_id) ?? []))
            let done = Number(spot.k ?? 0)
            for (;;) {
              const left = back.filter((one) => Number(one) > done)
              if (left.length === 0) break
              const { read, rows: found } = await readSome(caller, amoKind, left, { with: WITH[amoKind] })
              const alive = new Set<string>()
              for (const raw of found) {
                if (raw.is_deleted === true) continue
                alive.add(id(raw.id) ?? "")
                if (!client || !chosen || chosen.includes(ownerOf(raw))) rows.push(raw)
              }
              for (const one of left.slice(0, read)) if (!alive.has(one)) removed.add(one)
              done = Number(left[read - 1])
              spot = { ...spot, k: String(done) }
              progressed = true
            }
            if (after(more && events.length > 0, "")) return await answer(false)
            continue
          }
          return { reset: true }
        }
      } catch (error) {
        if (!(error instanceof Cut)) throw error
        if (!progressed) throw caller.spent()
        return answer(false)
      }
    },
    async stageHistory(_kind, since, after, context) {
      const caller = metered(context, true)
      const chosen = chosenOf(context)
      // `h<from>.<page>.<offset>.<latest>` inside a span; the latest time read once the span is done.
      const inside = /^h(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(after ?? "")
      const resumed = inside ? 0 : Number(after ?? 0) || 0
      // An event written late with an earlier time is still read; the store keeps each entry once by its id.
      const from = inside ? Number(inside[1]) : resumed ? resumed - seconds(OVERLAP_MS) : seconds(since)
      let at = inside ? { p: Number(inside[2]), o: Number(inside[3]) } : { p: 1, o: 0 }
      let last = inside ? Number(inside[4]) : resumed || from
      const start = `${at.p}.${at.o}`
      const items: CrmStageEntry[] = []
      const named = new Set<string>()
      const answer = (done: boolean): CrmPage<CrmStageEntry> => {
        items.sort((a, b) => a.at - b.at)
        return done
          ? { items, hasMore: false, cursor: String(last) }
          : { items, hasMore: true, nextCursor: `h${from}.${at.p}.${at.o}.${last}` }
      }
      try {
        for (;;) {
          const { rows, more } = await listPage(caller, ROUTES.events, "events", {
            ...typesOf(["lead_status_changed"]),
            "filter[created_at][from]": from,
            limit: EVENTS_PAGE,
            page: at.p,
          })
          while (at.o < rows.length) {
            const raw = rows[at.o] as Raw
            // Kommo events-list: `value_after: [{lead_status: {id, pipeline_id}}]`.
            const status = fieldOf(rawsOf(raw.value_after)[0], "lead_status")
            const externalId = text(raw.id)
            const item = id(raw.entity_id)
            const stage = id(fieldOf(status, "id"))
            const pipeline = id(fieldOf(status, "pipeline_id"))
            const when = Number(raw.created_at)
            // Under `mine` only the scope's deals: the events list cannot be narrowed by owner (events-and-notes).
            if (chosen && item) while (await resolveOwners(caller, [item])) {}
            if (
              externalId &&
              item &&
              stage &&
              pipeline &&
              when > 0 &&
              (!chosen || chosen.includes(owners.get(item) ?? "")) &&
              !named.has(externalId)
            ) {
              named.add(externalId)
              items.push({ externalId, kind: "deal", item, pipeline, stage, at: when * 1000 })
            }
            // Past every event read, kept or not: a span of colleagues' moves is not read again.
            if (when > 0) last = Math.max(last, when)
            at = { ...at, o: at.o + 1 }
          }
          if (!more || rows.length === 0) return answer(true)
          at = { p: at.p + 1, o: 0 }
          // The event order is not documented: each page is saved, and the store keeps an entry once.
          return answer(false)
        }
      } catch (error) {
        if (!(error instanceof Cut)) throw error
        if (`${at.p}.${at.o}` === start) throw caller.spent()
        return answer(false)
      }
    },
    // Read only when the account's activities setting is on; core keeps those on the deals and clients the copy holds.
    activities(since, page, context) {
      const caller = metered(context)
      return readActivities(
        (route, name, query) => listPage(caller, route, name, query),
        { since, now: now(), size, ...(page === undefined ? {} : { page }) },
        context,
      )
    },
    async users(context) {
      return (await readAll(metered(context), ROUTES.users, "users")).flatMap((raw) => toUser(raw) ?? [])
    },
    async list<K extends CrmLiveKind>(kind: K, query: CrmLiveQuery, context?: CrmCallContext) {
      const caller = metered(context)
      const filters = filtersOf(kind, query.conditions)
      if (Object.keys(filters).length && !(await accountOf(caller)).filters)
        throw new CliError(
          "validation_error",
          "this account has no API filter add-on (is_api_filter_enabled is off), so amoCRM cannot narrow the list " +
            "by owner or time; search by name instead",
          { reason: "amo.filters-off" },
        )
      const entity = ENTITIES[kind]
      const { rows, more } = await listPage(caller, entity.list, entity.name, {
        ...filters,
        ...(query.text ? { query: query.text } : {}),
        ...(kind === "organization" ? { with: "contacts" } : {}),
        "order[updated_at]": "desc",
        limit: query.limit,
        page: query.page ?? 1,
      })
      return { items: await mapped(kind, rows, caller), hasMore: more && rows.length > 0 }
    },
    async get<K extends CrmLiveKind>(kind: K, externalId: string, context?: CrmCallContext) {
      const caller = metered(context)
      const raw = await readOne(
        caller,
        ENTITIES[kind].one,
        externalId,
        kind === "organization" ? { with: "contacts" } : {},
      )
      return raw ? ((await mapped(kind, [raw], caller))[0] ?? null) : null
    },
    isAdmin,
    // A client is the sign-in's own when it is assigned to its user or on one of its user's leads.
    async ownClients(kind, ids) {
      const caller = account()
      const self = (await accountOf(caller)).userId
      const rows = await byIds(caller, kind, ids, { with: "leads" })
      await ownersOf(
        caller,
        rows.flatMap((raw) => linkedIds(raw, "leads")),
      )
      return new Set(
        rows
          .filter((raw) => ownerOf(raw) === self || linkedIds(raw, "leads").some((lead) => owners.get(lead) === self))
          .flatMap((raw) => id(raw.id) ?? []),
      )
    },
    async item(externalId) {
      const raw = await readOne(account(), ROUTES.lead, externalId, { with: WITH.deal })
      if (!raw) throw new CliError("not_found", `amoCRM has no deal ${externalId}`)
      return (await mapped("deal", [raw], account()))[0] as CrmItem
    },
    async lossReasons() {
      const { rows } = await listPage(account(), ROUTES.lossReasons, "loss_reasons", {})
      return rows.flatMap((raw) => {
        const reason = id(raw.id)
        return reason ? [{ id: reason, name: text(raw.name) ?? reason }] : []
      })
    },
  }
}
