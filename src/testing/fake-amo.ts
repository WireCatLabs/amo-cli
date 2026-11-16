import { LIMITS, WITH_VALUES } from "../amo/allow-list.js"
import { isRecord, type Json } from "../amo/json.js"
import { RELAY_URL } from "../amo/oauth.js"
import { matchOperation, type Operation } from "../amo/operation.js"
import { activitiesSeed, activityHandlers } from "./fake-activities.js"
import { bodyProblems, declaredParameter, parameterProblem } from "./spec-check.js"

/*
 * A strict fake of one amoCRM account, answering through `fetch`. Its routes are the CLI's operation table, which
 * `pnpm kommo:operations` generates from contracts/kommo-openapi.json, plus the allow-list (src/amo/allow-list.ts).
 * It refuses what the account would: an unknown path or method (404); a query parameter the operation does not
 * declare, a value of the wrong type, a `with` value no page names, a `limit` past the documented maximum, or a body
 * that does not match the operation's schema (400 problem+json with `validation-errors`); a wrong token (401); a
 * request past the pace (429). An empty list is 204 (amoCRM error codes, 2002). An operation it has no answer for is
 * 501, a read too, so a test never passes on an empty account it did not ask for. Visibly fake data only.
 */

/** Spelled so gitleaks lets it through; never a real token. */
export const FAKE_TOKEN = "wirecatfake0token42"
export const FAKE_HOST = "wirecatfake.amocrm.ru"
export const FAKE_ORIGIN = `https://${FAKE_HOST}`
export const FAKE_USER_ID = 7001
export const FAKE_COLLEAGUE_ID = 7002
export const FAKE_CLIENT_ID = "wirecatfake-client-0001"
export const FAKE_CLIENT_SECRET = "wirecatfake0secret"
export const FAKE_CODE = "wirecatfake0code"
/** Seconds: 2026-01-01T00:00:00Z, the seed's first moment. */
export const SEED_TIME = 1767225600

export interface FakeCall {
  method: string
  path: string
  /** Each name with every value it was sent, in order. */
  query: Record<string, string[]>
  body: unknown
  operation?: string
}

export interface FakeAmoOptions {
  host?: string
  /** Whether the token's user is an administrator; `/api/v4/users` answers 403 otherwise (users-api). */
  admin?: boolean
  /**
   * The account's `is_api_filter_enabled` (account-info), true when absent. Off, a `filter[…]` on leads, contacts or
   * companies is refused: an assumption, since no page says how amoCRM answers one without the add-on (filters-api).
   */
  apiFilter?: boolean
  /** The subscription ended: 402 on everything (amocrm.ru "Рекомендации"). */
  unpaid?: boolean
  /** The account or address is blocked: a bare 403 with no JSON on everything (Kommo "Limitations"). */
  blocked?: boolean
  /** Requests a second before 429; amoCRM's 7 (amocrm.ru "Рекомендации"). */
  perSecond?: number
  /** The clock the rate counts on; a test moves it, the fake never reads the wall clock unless left out. */
  now?: () => number
  /** Seconds the 429 body asks to wait (Kommo "HTTP codes" shows `retry_after`). */
  retryAfter?: number
  /** The next write lands and its answer is lost, as a dropped connection loses it. */
  loseNextWrite?: boolean
  /** Every request is answered with this status and a problem+json body. */
  failWith?: number
  /** The account's `currency` (account-info); RUB when absent. */
  currency?: string
  /** Seconds an OAuth access token lives; amoCRM's 86400 (oauth/oauth). */
  tokenLifetime?: number
  /** Answers a test adds for operations the fake has none for, by name: `{ "GET /api/v4/tasks": () => …}`. */
  routes?: Readonly<Record<string, Handler>>
}

export type Handler = (call: FakeCall, ids: Record<string, string>) => Response

const problem = (status: number, title: string, detail: string, extra: Json = {}) =>
  new Response(JSON.stringify({ title, type: `https://httpstatus.es/${status}`, status, detail, ...extra }), {
    status,
    headers: { "content-type": "application/problem+json" },
  })

const hal = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/hal+json" } })

const invalid = (path: string | string[], detail: string, code = "NotSupportedChoice") =>
  problem(400, "Bad Request", detail, {
    "validation-errors": [
      { request_id: "0", errors: (Array.isArray(path) ? path : [path]).map((one) => ({ code, path: one, detail })) },
    ],
  })

const notFound = () => problem(404, "Not Found", "Entity not found")

interface Field {
  id: number
  name: string
  code: string | null
  type: string
  sort: number
  enums: { id: number; value: string; sort: number }[] | null
}

interface Value {
  field_id: number
  field_name: string
  field_code: string | null
  field_type: string
  values: { value?: unknown; enum_id?: number; enum_code?: string | null }[]
}

const multitext = (field: Field, values: [string, string][]): Value => ({
  field_id: field.id,
  field_name: field.name,
  field_code: field.code,
  field_type: field.type,
  values: values.map(([value, enumCode]) => ({ value, enum_code: enumCode })),
})

const status = (id: number, name: string, pipeline: number, type: 0 | 1, sort: number) => ({
  id,
  name,
  sort,
  is_editable: id !== 142 && id !== 143,
  pipeline_id: pipeline,
  color: "#99ccff",
  type,
  account_id: 31000001,
})

const PHONE: Field = { id: 9001, name: "Телефон", code: "PHONE", type: "multitext", sort: 4, enums: null }
const EMAIL: Field = { id: 9002, name: "Email", code: "EMAIL", type: "multitext", sort: 6, enums: null }
const SOURCE: Field = {
  id: 9101,
  name: "Источник",
  code: null,
  type: "select",
  sort: 500,
  enums: [
    { id: 11, value: "Сайт", sort: 1 },
    { id: 12, value: "Звонок", sort: 2 },
  ],
}
const NOTE: Field = { id: 9201, name: "Примечание", code: null, type: "text", sort: 510, enums: null }

export interface FakeLead {
  id: number
  name: string
  price: number
  responsible_user_id: number
  group_id: number
  status_id: number
  pipeline_id: number
  loss_reason_id: number | null
  created_by: number
  updated_by: number
  created_at: number
  updated_at: number
  closed_at: number | null
  closest_task_at: null
  is_deleted: boolean
  custom_fields_values: Value[] | null
  score: null
  account_id: number
  /** The fake's own links, answered in `_embedded`. */
  contacts: number[]
  companies: number[]
}

export interface FakeContact {
  id: number
  name: string
  first_name: string
  last_name: string
  responsible_user_id: number
  group_id: number
  created_by: number
  updated_by: number
  created_at: number
  updated_at: number
  closest_task_at: null
  is_deleted: boolean
  is_unsorted: boolean
  custom_fields_values: Value[] | null
  account_id: number
  companies: number[]
}

export interface FakeCompany {
  id: number
  name: string
  responsible_user_id: number
  group_id: number
  created_by: number
  updated_by: number
  created_at: number
  updated_at: number
  closest_task_at: null
  is_deleted: boolean
  custom_fields_values: Value[] | null
  account_id: number
}

export interface FakeEvent {
  id: string
  type: string
  entity_id: number
  entity_type: string
  created_by: number
  created_at: number
  value_after: Json[]
  value_before: Json[]
  account_id: number
}

/** Synthetic: a ru account with two pipelines, each with its unsorted (type 1), regular, won (142) and lost (143). */
export const seed = (recent: number) => {
  const pipelines = [5001, 5002].map((id, at) => ({
    id,
    name: at === 0 ? "Продажи" : "Партнёры",
    sort: at + 1,
    is_main: at === 0,
    is_unsorted_on: true,
    is_archive: false,
    account_id: 31000001,
  }))
  const statuses = pipelines.flatMap((one) => [
    status(one.id * 10, "Неразобранное", one.id, 1, 10),
    status(one.id * 10 + 1, "Первичный контакт", one.id, 0, 20),
    status(one.id * 10 + 2, "Переговоры", one.id, 0, 30),
    status(142, "Успешно реализовано", one.id, 0, 10000),
    status(143, "Закрыто и не реализовано", one.id, 0, 11000),
  ])
  const lead = (
    id: number,
    name: string,
    pipeline: number,
    statusId: number,
    owner: number,
    contacts: number[],
    companies: number[] = [],
  ): FakeLead => ({
    id,
    name,
    price: id * 10,
    responsible_user_id: owner,
    group_id: 0,
    status_id: statusId,
    pipeline_id: pipeline,
    loss_reason_id: statusId === 143 ? 8801 : null,
    created_by: owner,
    updated_by: owner,
    created_at: SEED_TIME + id,
    updated_at: SEED_TIME + 86400 + id,
    closed_at: statusId === 142 || statusId === 143 ? SEED_TIME + 2 * 86400 : null,
    closest_task_at: null,
    is_deleted: false,
    custom_fields_values: id === 301 ? [{ ...multitext(SOURCE, []), values: [{ value: "Сайт", enum_id: 11 }] }] : null,
    score: null,
    account_id: 31000001,
    contacts,
    companies,
  })
  const contact = (id: number, at: number, owner: number, companies: number[]): FakeContact => ({
    id,
    name: `Test Person ${at + 1}`,
    first_name: "Test",
    last_name: `Person ${at + 1}`,
    responsible_user_id: owner,
    group_id: 0,
    created_by: owner,
    updated_by: owner,
    created_at: SEED_TIME + id,
    updated_at: SEED_TIME + 86400 + id,
    closest_task_at: null,
    is_deleted: false,
    is_unsorted: false,
    custom_fields_values: [
      multitext(PHONE, [[`+7 900 000-00-0${at}`, "WORK"]]),
      multitext(EMAIL, [[`person${at + 1}@example.test`, "WORK"]]),
      ...(at === 0 ? [{ ...multitext(NOTE, []), values: [{ value: "Test note" }] }] : []),
    ],
    account_id: 31000001,
    companies,
  })
  const company = (id: number, at: number, owner: number): FakeCompany => ({
    id,
    name: `Test Company ${at + 1}`,
    responsible_user_id: owner,
    group_id: 0,
    created_by: owner,
    updated_by: owner,
    created_at: SEED_TIME + id,
    updated_at: SEED_TIME + 86400 + id,
    closest_task_at: null,
    is_deleted: false,
    custom_fields_values: null,
    account_id: 31000001,
  })
  const event = (
    id: string,
    type: string,
    entity: number,
    entityType: string,
    at: number,
    after: Json[] = [],
    before: Json[] = [],
  ): FakeEvent => ({
    id,
    type,
    entity_id: entity,
    entity_type: entityType,
    created_by: FAKE_USER_ID,
    created_at: at,
    value_after: after,
    value_before: before,
    account_id: 31000001,
  })
  const moved = (from: number, to: number, pipeline: number) => ({
    after: [{ lead_status: { id: to, pipeline_id: pipeline } }],
    before: [{ lead_status: { id: from, pipeline_id: pipeline } }],
  })
  const won = moved(50011, 142, 5001)
  const negotiating = moved(50011, 50012, 5001)
  return {
    account: {
      id: 31000001,
      name: "WireCat Fake Account",
      subdomain: "wirecatfake",
      current_user_id: FAKE_USER_ID,
      country: "RU",
      currency: "RUB",
      currency_symbol: "₽",
      customers_mode: "disabled",
      is_unsorted_on: true,
      is_loss_reason_enabled: true,
      is_helpbot_enabled: false,
      is_technical_account: true,
      contact_name_display_order: 1,
    },
    users: [
      {
        id: FAKE_USER_ID,
        name: "Test Owner",
        email: "owner@example.test",
        lang: "ru",
        rights: { is_admin: true, is_active: true },
      },
      {
        id: FAKE_COLLEAGUE_ID,
        name: "Test Colleague",
        email: "colleague@example.test",
        lang: "ru",
        rights: { is_admin: false, is_active: true },
      },
    ],
    pipelines,
    statuses,
    lossReasons: [
      { id: 8801, name: "Дорого", sort: 0, created_at: SEED_TIME, updated_at: SEED_TIME },
      { id: 8802, name: "Выбрали другого", sort: 1, created_at: SEED_TIME, updated_at: SEED_TIME },
    ],
    leads: [
      lead(301, "Test lead one", 5001, 50011, FAKE_USER_ID, [401], [501]),
      lead(302, "Test lead two", 5001, 142, FAKE_USER_ID, [402]),
      lead(303, "Test lead three", 5001, 143, FAKE_COLLEAGUE_ID, [403], [502]),
      lead(304, "Test lead four", 5002, 50020, FAKE_USER_ID, [401]),
    ],
    contacts: [
      contact(401, 0, FAKE_USER_ID, [501]),
      contact(402, 1, FAKE_USER_ID, []),
      contact(403, 2, FAKE_COLLEAGUE_ID, [502]),
    ],
    companies: [company(501, 0, FAKE_COLLEAGUE_ID), company(502, 1, FAKE_COLLEAGUE_ID)],
    events: [
      event(
        "01fakeevent0001",
        "lead_status_changed",
        302,
        "lead",
        SEED_TIME + 1000,
        negotiating.after,
        negotiating.before,
      ),
      event(
        "01fakeevent0002",
        "lead_status_changed",
        302,
        "lead",
        SEED_TIME + 2000,
        won.after,
        moved(50012, 142, 5001).before,
      ),
      event("01fakeevent0003", "lead_added", 301, "lead", SEED_TIME + 3000),
    ] as FakeEvent[],
    ...activitiesSeed(recent, FAKE_USER_ID, FAKE_COLLEAGUE_ID),
    customFields: {
      contacts: [PHONE, EMAIL, NOTE],
      leads: [SOURCE],
      // The multitext type is for contacts, not companies (custom-fields, the table of field types per entity).
      companies: [NOTE],
    } as Record<string, Field[]>,
  }
}

/** No page names the default page size; 50 is what a list without `limit` answers here, an assumption. */
const DEFAULT_LIMIT = 50

type Data = ReturnType<typeof seed>
type Entity = "leads" | "contacts" | "companies"

const valuesOf = (call: FakeCall, name: string) =>
  [...(call.query[name] ?? []), ...(call.query[`${name}[]`] ?? [])].flatMap((one) => one.split(","))

const withOf = (call: FakeCall) => new Set(valuesOf(call, "with"))

/** The `filter[…]`, `order[…]` and `query` a list takes, as amoCRM documents them (filters-api, leads-api). */
const narrowed = <T extends { id: number; name: string; updated_at: number; created_at: number }>(
  call: FakeCall,
  all: T[],
  owner: (one: T) => number,
): T[] => {
  const ids = valuesOf(call, "filter[id]")
  const owners = valuesOf(call, "filter[responsible_user_id]")
  const bound = (name: string) => (call.query[name] ? Number(call.query[name]?.[0]) : undefined)
  const range = (key: "updated_at" | "created_at") => [bound(`filter[${key}][from]`), bound(`filter[${key}][to]`)]
  const [updatedFrom, updatedTo] = range("updated_at")
  const [createdFrom, createdTo] = range("created_at")
  const text = call.query.query?.[0]?.toLowerCase()
  const matching = all.filter(
    (one) =>
      (!ids.length || ids.includes(String(one.id))) &&
      (!owners.length || owners.includes(String(owner(one)))) &&
      (updatedFrom === undefined || one.updated_at >= updatedFrom) &&
      (updatedTo === undefined || one.updated_at <= updatedTo) &&
      (createdFrom === undefined || one.created_at >= createdFrom) &&
      (createdTo === undefined || one.created_at <= createdTo) &&
      (text === undefined || one.name.toLowerCase().includes(text)),
  )
  const [key, way] =
    Object.entries(call.query)
      .filter(([name]) => name.startsWith("order["))
      .map(([name, value]) => [name.slice(6, -1), value[0]])[0] ?? []
  const field = (key === "updated_at" || key === "created_at" ? key : "id") as "id" | "updated_at" | "created_at"
  const sign = way === "desc" ? -1 : 1
  return [...matching].sort((a, b) => sign * (a[field] - b[field] || a.id - b.id))
}

const page = (call: FakeCall, name: string, all: unknown[], href: string) => {
  const limit = Number(call.query.limit?.[0] ?? DEFAULT_LIMIT)
  const at = Number(call.query.page?.[0] ?? 1)
  const items = all.slice((at - 1) * limit, at * limit)
  if (items.length === 0) return new Response(null, { status: 204 })
  const more = at * limit < all.length
  return hal({
    _page: at,
    _links: { self: { href }, ...(more ? { next: { href: `${href}?page=${at + 1}&limit=${limit}` } } : {}) },
    _embedded: { [name]: items },
  })
}

const one = (all: unknown[], id: string | undefined) => {
  const found = all.find((record) => isRecord(record) && String(record.id) === id)
  return found ? hal(found) : notFound()
}

const link = (id: number, type: string) => ({ id, _links: { self: { href: `${FAKE_ORIGIN}/api/v4/${type}/${id}` } } })

/** What each entity's answer embeds: companies always, contacts and leads with `with` (leads-api, contacts-api). */
const shapes = (data: Data, call: FakeCall) => {
  const asked = withOf(call)
  const leadsOf = (test: (lead: FakeLead) => boolean) =>
    asked.has("leads") ? { leads: data.leads.filter(test).map((lead) => link(lead.id, "leads")) } : {}
  return {
    leads: ({ contacts, companies, ...lead }: FakeLead) => ({
      ...lead,
      _embedded: {
        tags: [],
        companies: companies.map((id) => link(id, "companies")),
        ...(asked.has("contacts")
          ? { contacts: contacts.map((id, at) => ({ ...link(id, "contacts"), is_main: at === 0 })) }
          : {}),
        ...(asked.has("loss_reason") && lead.loss_reason_id
          ? { loss_reason: data.lossReasons.filter((reason) => reason.id === lead.loss_reason_id) }
          : {}),
      },
    }),
    contacts: ({ companies, ...contact }: FakeContact) => ({
      ...contact,
      _embedded: {
        tags: [],
        companies: companies.map((id) => link(id, "companies")),
        ...leadsOf((lead) => lead.contacts.includes(contact.id)),
      },
    }),
    companies: (company: FakeCompany) => ({
      ...company,
      _embedded: {
        tags: [],
        ...(asked.has("contacts")
          ? {
              contacts: data.contacts
                .filter((contact) => contact.companies.includes(company.id))
                .map((contact) => link(contact.id, "contacts")),
            }
          : {}),
        ...leadsOf((lead) => lead.companies.includes(company.id)),
      },
    }),
  }
}

/** A write's `custom_fields_values`, checked against the entity's fields, in the shape a read answers. */
const customOf = (fields: Field[], given: unknown): Value[] | string => {
  const values: Value[] = []
  for (const item of Array.isArray(given) ? given : []) {
    const field = fields.find((one) => isRecord(item) && (one.id === item.field_id || one.code === item.field_code))
    if (!field || !isRecord(item)) return "custom_fields_values"
    const list = Array.isArray(item.values) ? item.values.filter(isRecord) : []
    for (const value of list)
      if (value.enum_id !== undefined && !field.enums?.some((option) => option.id === value.enum_id))
        return `custom_fields_values.${field.id}.enum_id`
    values.push({
      ...multitext(field, []),
      values: list.map((value) =>
        value.enum_id === undefined
          ? { value: value.value, ...(value.enum_code ? { enum_code: String(value.enum_code) } : {}) }
          : {
              value: field.enums?.find((option) => option.id === value.enum_id)?.value,
              enum_id: Number(value.enum_id),
            },
      ),
    })
  }
  return values
}

const merged = (before: Value[] | null, after: Value[]): Value[] | null => {
  const kept = (before ?? []).filter((one) => !after.some((other) => other.field_id === one.field_id))
  const all = [...kept, ...after.filter((one) => one.values.length > 0)]
  return all.length ? all : null
}

/** A create makes each record; an update changes the named ones, and a record that is not there is a 404. */
const writes = (data: Data, now: () => number) => {
  let nextId = 1000
  const seconds = () => Math.floor(now() / 1000)
  /**
   * A pipeline named without a stage: leads-api documents only "the first stage of the main pipeline" when neither is
   * sent, so the fake assumes the named pipeline's first regular stage (not its unsorted one).
   */
  const staged = (item: Json): Json => {
    if (item.pipeline_id === undefined || item.status_id !== undefined) return item
    const first = data.statuses
      .filter((one) => one.pipeline_id === Number(item.pipeline_id) && one.type === 0)
      .sort((a, b) => a.sort - b.sort)[0]
    return { ...item, status_id: first?.id }
  }
  const refusedStage = (item: Json, lead?: FakeLead) => {
    const pipeline = Number(item.pipeline_id ?? lead?.pipeline_id ?? data.pipelines[0]?.id)
    if (item.status_id === undefined && item.pipeline_id === undefined) return undefined
    const stage = Number(item.status_id)
    return data.statuses.some((one) => one.pipeline_id === pipeline && one.id === stage) ? undefined : "status_id"
  }
  const apply = <T extends { custom_fields_values: Value[] | null; updated_at: number }>(
    record: T,
    item: Json,
    fields: Field[],
  ): string | undefined => {
    const { custom_fields_values: custom, _embedded: _ignored, request_id: _request, id: _id, ...rest } = item
    if (custom !== undefined) {
      const values = customOf(fields, custom)
      if (typeof values === "string") return values
      record.custom_fields_values = merged(record.custom_fields_values, values)
    }
    Object.assign(record, rest, { updated_at: seconds() })
    if ("status_id" in rest && "closed_at" in record) {
      const closing = rest.status_id === 142 || rest.status_id === 143
      Object.assign(record, { closed_at: closing ? seconds() : null, ...(closing ? {} : { loss_reason_id: null }) })
    }
    return undefined
  }
  const blank = {
    leads: (): FakeLead => ({
      ...(data.leads[0] as FakeLead),
      name: "",
      price: 0,
      status_id: Number(data.statuses[1]?.id),
      pipeline_id: Number(data.pipelines[0]?.id),
      loss_reason_id: null,
      responsible_user_id: FAKE_USER_ID,
      closed_at: null,
      custom_fields_values: null,
      contacts: [],
      companies: [],
    }),
    contacts: (): FakeContact => ({
      ...(data.contacts[0] as FakeContact),
      name: "",
      first_name: "",
      last_name: "",
      responsible_user_id: FAKE_USER_ID,
      custom_fields_values: null,
      companies: [],
    }),
    companies: (): FakeCompany => ({
      ...(data.companies[0] as FakeCompany),
      name: "",
      responsible_user_id: FAKE_USER_ID,
      custom_fields_values: null,
    }),
  }
  const answer = (type: Entity, done: Json[]) =>
    hal({ _links: { self: { href: `${FAKE_ORIGIN}/api/v4/${type}` } }, _embedded: { [type]: done } })
  const create = (type: Entity) => (call: FakeCall) => {
    const done: Json[] = []
    for (const given of call.body as Json[]) {
      const item = type === "leads" ? staged(given) : given
      const record = blank[type]()
      const wrong =
        (type === "leads" ? refusedStage(item) : undefined) ?? apply(record, item, data.customFields[type] ?? [])
      if (wrong) return invalid(wrong, `${type} create refused ${wrong}`, "InvalidValue")
      record.id = ++nextId
      record.created_at = seconds()
      const embedded = isRecord(item._embedded) ? item._embedded : {}
      if (type === "leads") {
        const lead = record as FakeLead
        lead.contacts = (Array.isArray(embedded.contacts) ? embedded.contacts : []).map((one) => Number(one.id))
        lead.companies = (Array.isArray(embedded.companies) ? embedded.companies : []).map((one) => Number(one.id))
      }
      ;(data[type] as unknown[]).push(record)
      done.push({ id: record.id, request_id: String(item.request_id ?? record.id) })
    }
    return answer(type, done)
  }
  const update = (type: Entity, items: Json[]) => {
    const all = data[type] as (FakeLead | FakeContact | FakeCompany)[]
    const found = items.map((item) => all.find((record) => record.id === Number(item.id)))
    if (found.some((record) => record === undefined)) return notFound()
    for (const [at, given] of items.entries()) {
      const item = type === "leads" ? staged(given) : given
      const record = found[at] as FakeLead
      const wrong =
        (type === "leads" ? refusedStage(item, record) : undefined) ??
        apply(record, item, data.customFields[type] ?? [])
      if (wrong) return invalid(wrong, `${type} update refused ${wrong}`, "InvalidValue")
    }
    return answer(
      type,
      found.map((record) => ({ id: record?.id ?? 0, updated_at: record?.updated_at ?? 0 })),
    )
  }
  return {
    create,
    update: (type: Entity) => (call: FakeCall) => update(type, call.body as Json[]),
    updateOne: (type: Entity) => (call: FakeCall, ids: Record<string, string>) =>
      update(type, [{ ...(call.body as Json), id: Number(ids.id) }]),
  }
}

const handlersFor = (data: Data, options: FakeAmoOptions, now: () => number): Record<string, Handler> => {
  const written = writes(data, now)
  const refusedUsers = () => problem(403, "Forbidden", "Access denied")
  const href = (path: string) => `${FAKE_ORIGIN}${path}`
  const lists = Object.fromEntries(
    (["leads", "contacts", "companies"] as const).flatMap((type) => {
      const owner = (record: { responsible_user_id: number }) => record.responsible_user_id
      const list: Handler = (call) => {
        const shape = shapes(data, call)[type] as (record: unknown) => Json
        const all = narrowed(call, data[type] as FakeLead[], owner).map(shape)
        return page(call, type, all, href(`/api/v4/${type}`))
      }
      const single: Handler = (call, ids) =>
        one((data[type] as FakeLead[]).map(shapes(data, call)[type] as (record: unknown) => Json), ids.id)
      return [
        [`GET /api/v4/${type}`, list],
        [`GET /api/v4/${type}/{id}`, single],
        [`POST /api/v4/${type}`, written.create(type)],
        [`PATCH /api/v4/${type}`, written.update(type)],
        [`PATCH /api/v4/${type}/{id}`, written.updateOne(type)],
        [
          `GET /api/v4/${type}/custom_fields`,
          (call: FakeCall) =>
            page(call, "custom_fields", data.customFields[type] ?? [], href(`/api/v4/${type}/custom_fields`)),
        ],
      ]
    }),
  ) as Record<string, Handler>
  return {
    ...lists,
    "GET /api/v4/account": (call) => {
      const asked = withOf(call)
      return hal({
        ...data.account,
        ...(asked.has("is_api_filter_enabled") ? { is_api_filter_enabled: options.apiFilter !== false } : {}),
        _links: { self: { href: href("/api/v4/account") } },
      })
    },
    "GET /api/v4/users": (call) =>
      options.admin === false ? refusedUsers() : page(call, "users", data.users, href("/api/v4/users")),
    "GET /api/v4/users/{id}": (_, ids) => (options.admin === false ? refusedUsers() : one(data.users, ids.id)),
    "GET /api/v4/leads/pipelines": () =>
      hal({
        _total_items: data.pipelines.length,
        _embedded: {
          pipelines: data.pipelines.map((pipeline) => ({
            ...pipeline,
            _embedded: { statuses: data.statuses.filter((status) => status.pipeline_id === pipeline.id) },
          })),
        },
      }),
    "GET /api/v4/leads/pipelines/{id}": (_, ids) => one(data.pipelines, ids.id),
    "GET /api/v4/leads/pipelines/{pipeline_id}/statuses": (call, ids) =>
      page(
        call,
        "statuses",
        data.statuses.filter((status) => String(status.pipeline_id) === ids.pipeline_id),
        href(`/api/v4/leads/pipelines/${ids.pipeline_id}/statuses`),
      ),
    "GET /api/v4/leads/loss_reasons": () =>
      hal({ _total_items: data.lossReasons.length, _embedded: { loss_reasons: data.lossReasons } }),
    // Kommo events-list: `filter[type]` and `filter[entity]` are comma lists, `filter[created_at][from]` a time.
    "GET /api/v4/events": (call) => {
      const types = valuesOf(call, "filter[type]")
      const entities = valuesOf(call, "filter[entity]")
      const from = Number(call.query["filter[created_at][from]"]?.[0] ?? 0)
      const all = data.events.filter(
        (one) =>
          (!types.length || types.includes(one.type)) &&
          (!entities.length || entities.includes(one.entity_type)) &&
          one.created_at >= from,
      )
      return page(call, "events", all, href("/api/v4/events"))
    },
    ...activityHandlers(data, { href, page, valuesOf }),
  }
}

/**
 * What `filter[…]` needs: the account's API filter add-on, on the lead, contact and company lists (filters-api). Tasks
 * and notes document their own filters on their own pages, so they are taken as open without it (research §6, inferred).
 */
const FILTERED = new Set(["/api/v4/leads", "/api/v4/contacts", "/api/v4/companies"])

/** A query the operation does not declare, a value of the wrong type, a `with` no page names, a `limit` too big. */
const queryRefusal = (operation: Operation, call: FakeCall, options: FakeAmoOptions): Response | undefined => {
  for (const [name, values] of Object.entries(call.query)) {
    const declared = declaredParameter(operation, name)
    if (declared === undefined) return invalid(name, `${operation.name} takes no ${name}`)
    if (options.apiFilter === false && name.startsWith("filter[") && FILTERED.has(operation.template))
      return invalid(name, "API filters are an add-on this account does not have", "FilterDisabled")
    if (name === "with") {
      const allowed = WITH_VALUES[operation.name]?.values ?? []
      const wrong = values.flatMap((value) => value.split(",")).find((value) => !allowed.includes(value))
      if (wrong !== undefined) return invalid("with", `${operation.name} takes no with=${wrong}`)
      continue
    }
    if (name === "limit" || name === "page") {
      const number = Number(values[0])
      const most = name === "limit" ? (LIMITS.byPath[operation.template] ?? LIMITS.default) : Number.MAX_SAFE_INTEGER
      if (values.length !== 1 || !/^[0-9]+$/.test(values[0] ?? "") || number < 1 || number > most)
        return invalid(name, `${name} takes a whole number from 1 to ${most}`)
      continue
    }
    const wrong = parameterProblem(operation, declared, name, values)
    if (wrong) return invalid(name, `${name} is not the type the reference gives`, "InvalidType")
  }
  return undefined
}

/**
 * A mass update names each record by `id`: the leads, sources and notes pages mark it required, the contacts,
 * companies and tasks pages leave it out of the schema, and without it nothing says which record to change.
 */
const missingIds = (operation: Operation, body: unknown): string[] =>
  operation.method === "PATCH" && !operation.template.endsWith("}") && Array.isArray(body)
    ? body.flatMap((item, at) => (isRecord(item) && item.id === undefined ? [`${at}.id`] : []))
    : []

const bodyRefusal = (operation: Operation, body: unknown): Response | undefined => {
  if (body === undefined)
    return operation.body && operation.method !== "GET" && operation.method !== "DELETE"
      ? invalid("body", `${operation.name} needs a body`, "NotBlank")
      : undefined
  if (!operation.body) return invalid("body", `${operation.name} takes no body`)
  const unnamed = missingIds(operation, body)
  if (unnamed.length) return invalid(unnamed, `${operation.name} changes records named by id`, "NotBlank")
  const wrong = bodyProblems(operation, body)
  return wrong.length ? invalid(wrong, `the body does not match ${operation.name}`, "InvalidType") : undefined
}

/** The fields `/oauth2/access_token` takes (contracts/kommo-openapi.json, Kommo get-token); `oauth.test.ts` checks it. */
export const TOKEN_FIELDS = ["client_id", "client_secret", "grant_type", "code", "refresh_token", "redirect_uri"]

/** amoCRM's token endpoint: a JSON body, a code once, and a refresh token that dies when it is used (oauth/step-by-step). */
const tokenEndpoint = (options: FakeAmoOptions, tokens: { access: Set<string>; refresh: string; issued: number }) => {
  const refused = (hint: string) => problem(400, "Invalid request", "The request is invalid", { hint })
  return (init: RequestInit, body: unknown): Response => {
    if ((init.method ?? "GET") !== "POST") return problem(405, "Method Not Allowed", "POST only")
    if (!new Headers(init.headers).get("content-type")?.includes("application/json"))
      return refused("The body must be JSON")
    if (!isRecord(body)) return refused("The body must be an object")
    const unknown = Object.keys(body).filter((key) => !TOKEN_FIELDS.includes(key))
    if (unknown.length) return invalid(unknown, "the token request takes no such field")
    if (body.client_id !== FAKE_CLIENT_ID) return refused("Check the `client_id` parameter")
    if (body.client_secret !== FAKE_CLIENT_SECRET) return refused("Check the `client_secret` parameter")
    if (body.redirect_uri !== RELAY_URL) return refused("Check the `redirect_uri` parameter")
    const code = body.grant_type === "authorization_code" ? body.code === FAKE_CODE : undefined
    const refresh = body.grant_type === "refresh_token" ? body.refresh_token === tokens.refresh : undefined
    if (code === false) return refused("Cannot decrypt the authorization code")
    if (refresh === false) return refused("Token has been revoked")
    if (code === undefined && refresh === undefined) return refused("Unsupported grant type")
    tokens.issued += 1
    const access = `wirecatfake0access${tokens.issued}`
    tokens.access.add(access)
    tokens.refresh = `wirecatfake0refresh${tokens.issued}`
    return new Response(
      JSON.stringify({
        token_type: "Bearer",
        expires_in: options.tokenLifetime ?? 86400,
        server_time: 1751892369,
        access_token: access,
        refresh_token: tokens.refresh,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }
}

export const fakeAmo = (options: FakeAmoOptions = {}) => {
  const host = options.host ?? FAKE_HOST
  const now = options.now ?? Date.now
  const data = seed(Math.floor(now() / 1000) - 3600)
  if (options.currency) data.account.currency = options.currency
  const calls: FakeCall[] = []
  const sent: number[] = []
  let loseNext = options.loseNextWrite === true
  const handlers = { ...handlersFor(data, options, now), ...options.routes }
  const tokens = { access: new Set([FAKE_TOKEN]), refresh: "", issued: 0 }
  const token = tokenEndpoint(options, tokens)

  const answer = (call: FakeCall, init: RequestInit, url: URL): Response => {
    if (options.blocked) return new Response("<html><body>403 Forbidden</body></html>", { status: 403 })
    if (url.pathname === "/oauth2/access_token") return token(init, call.body)
    const auth = new Headers(init.headers).get("authorization") ?? ""
    if (!auth.startsWith("Bearer ") || !tokens.access.has(auth.slice(7)))
      return problem(401, "Unauthorized", "Unauthorized")
    sent.push(now())
    const recent = sent.filter((at) => at > now() - 1000).length
    if (recent > (options.perSecond ?? 7))
      return problem(429, "Too Many Requests", "Too many requests", { retry_after: options.retryAfter ?? 1 })
    if (options.unpaid) return problem(402, "Payment Required", "Payment required")
    if (options.failWith) return problem(options.failWith, "Scripted", "Scripted failure")
    let matched: ReturnType<typeof matchOperation>
    try {
      matched = matchOperation(`${call.method} ${url.pathname}`)
    } catch {
      return problem(404, "Not Found", "Not found")
    }
    const { operation, ids } = matched
    call.operation = operation.name
    const refusal = queryRefusal(operation, call, options) ?? bodyRefusal(operation, call.body)
    if (refusal) return refusal
    const handler = handlers[operation.name]
    return handler
      ? handler(call, ids)
      : problem(501, "Not Implemented", `the fake has no answer for ${operation.name}; a test adds one with routes`)
  }

  const fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.host !== host) throw new TypeError(`fake amo: ${url.host} is not the account ${host}`)
    const query: Record<string, string[]> = {}
    for (const [key, value] of url.searchParams) query[key] = [...(query[key] ?? []), value]
    const text = typeof init.body === "string" ? init.body : undefined
    const call: FakeCall = {
      method: init.method ?? "GET",
      path: url.pathname,
      query,
      body: text === undefined ? undefined : (JSON.parse(text) as unknown),
    }
    calls.push(call)
    const response = answer(call, init, url)
    if (call.method !== "GET" && loseNext && response.ok) {
      loseNext = false
      throw new TypeError("fake amo: the connection dropped after the write landed")
    }
    return response
  }

  return {
    fetch,
    calls,
    data,
    /** The next write lands and its answer is lost. */
    loseNextWrite: () => {
      loseNext = true
    },
    /** Write requests that reached the account's API, the token endpoint left out. */
    writes: () => calls.filter((one) => one.method !== "GET" && one.path.startsWith("/api/v4/")).length,
    /** The OAuth access tokens issued so far stop working, as one past its day does. */
    expireAccess: () => {
      for (const one of [...tokens.access]) if (one !== FAKE_TOKEN) tokens.access.delete(one)
    },
    /** Deletes a record as amoCRM's trash does, with the `<type>_deleted` event (events-and-notes). */
    remove: (type: "lead" | "contact" | "company", id: number, at: number) => {
      const list: { id: number }[] = { lead: data.leads, contact: data.contacts, company: data.companies }[type]
      list.splice(
        list.findIndex((one) => one.id === id),
        1,
      )
      data.events.push({
        id: `01fakedeleted${id}`,
        type: `${type}_deleted`,
        entity_id: id,
        entity_type: type,
        created_by: FAKE_USER_ID,
        created_at: at,
        value_after: [],
        value_before: [],
        account_id: 31000001,
      })
    },
  }
}

export type FakeAmo = ReturnType<typeof fakeAmo>
