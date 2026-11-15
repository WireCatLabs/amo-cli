import { CliError, isCliError } from "@wirecat/cli-base"
import type { CrmField, CrmItem, CrmKind, CrmRecords, CrmStageEntry } from "@wirecat/cli-core"
import {
  type CrmCallContext,
  type CrmChanges,
  type CrmCondition,
  type CrmLiveKind,
  type CrmLiveQuery,
  type CrmSource,
  crmValues,
} from "@wirecat/cli-core/crm"
import { matchOperation } from "../amo/operation.js"
import { type AmoKind, ENTITIES, ROUTES, type Route } from "../amo/routes.js"
import type { AmoRequest, AmoTransport, QueryValue } from "../amo/transport.js"
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
const LINKED = "l"

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

/** `<page>@<when the round started>`, or `l<offset>@…` for the clients a `mine` round reads by id after its own. */
const pageOf = (page: string | undefined, now: number) => {
  const [at, started] = (page ?? "").split("@")
  const linked = at?.startsWith(LINKED) ? Number(at.slice(LINKED.length)) || 0 : null
  return { at: linked === null ? Number(at) || 1 : 1, linked, started: Number(started) || now }
}

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
      if (op === "=" || op === ">=" || op === ">")
        set(`filter[${field}][from]`, op === ">" ? seconds(ms) + 1 : Math.ceil(ms / 1000))
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
  /** core paid for a call's first request; each further one is spent from the run's budget. */
  const metered = (context?: CrmCallContext): Caller => {
    let paid = false
    return {
      request: (request) => {
        if (paid) context?.spend()
        paid = true
        return account().request(request)
      },
    }
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
   * The contacts and companies on the chosen users' leads: every lead of theirs, or with `from` those changed since.
   * The rounds of companies and contacts start minutes apart, so the second reuses the first's list.
   */
  const lists = new Map<string, { at: number; found: Promise<Record<"person" | "organization", Set<string>>> }>()
  const clientsOf = (caller: Caller, chosen: readonly string[], from: number | null, started: number) => {
    const key = `${chosen.join(",")}>${from ?? ""}`
    const kept = lists.get(key)
    if (kept && Math.abs(started - kept.at) < OVERLAP_MS) return kept.found
    const found = (async () => {
      const { filters } = await accountOf(caller)
      const clients = { person: new Set<string>(), organization: new Set<string>() }
      const narrow: Record<string, QueryValue> = filters ? { "filter[responsible_user_id][]": chosen.map(Number) } : {}
      for (let at = 1; ; at++) {
        const { rows, more } = await round(caller, "deal", at, from, narrow)
        remember(rows)
        for (const raw of rows.filter((one) => chosen.includes(ownerOf(one)))) {
          for (const contact of linkedIds(raw, "contacts")) clients.person.add(contact)
          for (const company of linkedIds(raw, "companies")) clients.organization.add(company)
        }
        if (!more || rows.length === 0) return clients
      }
    })()
    found.catch(() => lists.delete(key))
    lists.set(key, { at: started, found })
    return found
  }

  /** `<entity>_deleted` and `_restored` events since `from`: the last of each record says whether it is gone. */
  const removedSince = async (caller: Caller, kind: AmoKind, from: number) => {
    const { event } = ENTITIES[kind]
    const last = new Map<string, { at: number; deleted: boolean }>()
    for (let page = 1; ; page++) {
      const { rows, more } = await listPage(caller, ROUTES.events, "events", {
        "filter[type]": `${event}_deleted,${event}_restored`,
        "filter[created_at][from]": from,
        limit: EVENTS_PAGE,
        page,
      })
      for (const raw of rows) {
        const entity = id(raw.entity_id)
        const at = Number(raw.created_at) || 0
        if (entity && at >= (last.get(entity)?.at ?? 0))
          last.set(entity, { at, deleted: raw.type === `${event}_deleted` })
      }
      if (!more || rows.length === 0) break
    }
    return [...last].flatMap(([entity, { deleted }]) => (deleted ? [entity] : []))
  }

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
      const caller = metered(context)
      const { at, linked, started } = pageOf(page, now())
      const from = since === null ? null : seconds(since - OVERLAP_MS)
      const chosen = chosenOf(context)
      const { filters } = await accountOf(caller)
      const ended = async (rows: Raw[]): Promise<CrmChanges<CrmRecords[K]>> => ({
        items: await mapped(kind, rows, caller),
        hasMore: false,
        ...(from === null ? {} : { removed: await removedSince(caller, amoKind, from) }),
        cursor: new Date(started).toISOString(),
      })
      const next = async (rows: Raw[], cursorOf: string): Promise<CrmChanges<CrmRecords[K]>> => ({
        items: await mapped(kind, rows, caller),
        hasMore: true,
        nextCursor: `${cursorOf}@${started}`,
      })
      if (amoKind === "deal") {
        // A round of changes reads every assignee's leads, so core sees one given away; a full round only the chosen.
        const narrow: Record<string, QueryValue> =
          from === null && chosen && filters ? { "filter[responsible_user_id][]": chosen.map(Number) } : {}
        const { rows, more } = await round(caller, "deal", at, from, narrow)
        remember(rows)
        const kept = from === null && chosen ? rows.filter((raw) => chosen.includes(ownerOf(raw))) : rows
        return more && rows.length ? next(kept, String(at + 1)) : ended(kept)
      }
      const client = amoKind as "person" | "organization"
      if (!chosen) {
        const { rows, more } = await round(caller, client, at, from)
        return more && rows.length ? next(rows, String(at + 1)) : ended(rows)
      }
      // The clients on the chosen users' leads: all of them in a full round, those on changed leads after a cursor.
      const named = [...(await clientsOf(caller, chosen, from, started))[client]]
      if (linked !== null) {
        const chunk = named.slice(linked, linked + size)
        // A chosen user's own client changed in this span came with the round already; once is enough.
        const rows = (await byIds(caller, client, chunk, { with: WITH[client] })).filter(
          (raw) => !(chosen.includes(ownerOf(raw)) && (from === null || Number(raw.updated_at) >= from)),
        )
        return linked + size < named.length ? next(rows, `${LINKED}${linked + size}`) : ended(rows)
      }
      // Without the add-on a full round lists every client once, so the named ones are kept from it, not read again.
      const listsAll = from === null && !filters
      const narrow: Record<string, QueryValue> =
        from === null && filters ? { "filter[responsible_user_id][]": chosen.map(Number) } : {}
      const { rows, more } = await round(caller, client, at, from, narrow)
      if (from !== null)
        await ownersOf(
          caller,
          rows.flatMap((raw) => linkedIds(raw, "leads")),
        )
      const own = new Set(named)
      const kept = rows.filter(
        (raw) =>
          chosen.includes(ownerOf(raw)) ||
          (listsAll && own.has(id(raw.id) ?? "")) ||
          (from !== null && linkedIds(raw, "leads").some((lead) => chosen.includes(owners.get(lead) ?? ""))),
      )
      if (more && rows.length) return next(kept, String(at + 1))
      if (listsAll || named.length === 0) return ended(kept)
      return next(kept, `${LINKED}0`)
    },
    async stageHistory(_kind, since, after, context) {
      const caller = metered(context)
      const from = after === undefined ? seconds(since) : Number(after) || seconds(since)
      const items: CrmStageEntry[] = []
      let last = from
      for (let page = 1; ; page++) {
        const { rows, more } = await listPage(caller, ROUTES.events, "events", {
          "filter[type]": "lead_status_changed",
          "filter[created_at][from]": from,
          limit: EVENTS_PAGE,
          page,
        })
        for (const raw of rows) {
          // Kommo events-list: `value_after: [{lead_status: {id, pipeline_id}}]`.
          const status = fieldOf(rawsOf(raw.value_after)[0], "lead_status")
          const externalId = text(raw.id)
          const item = id(raw.entity_id)
          const stage = id(fieldOf(status, "id"))
          const pipeline = id(fieldOf(status, "pipeline_id"))
          const at = Number(raw.created_at)
          if (!externalId || !item || !stage || !pipeline || !(at > 0)) continue
          items.push({ externalId, kind: "deal", item, pipeline, stage, at: at * 1000 })
          last = Math.max(last, at)
        }
        if (!more || rows.length === 0) break
      }
      // The event order is not documented, so the whole span is read in one call; the store keeps each entry once.
      items.sort((a, b) => a.at - b.at)
      return { items, hasMore: false, cursor: String(last) }
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
