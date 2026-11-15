import { LIMITS, WITH_VALUES } from "../amo/allow-list.js"
import { isRecord, type Json } from "../amo/json.js"
import { matchOperation, type Operation } from "../amo/operation.js"
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

const cf = (id: number, code: string, values: [string, string][]) => ({
  field_id: id,
  field_name: code === "PHONE" ? "Телефон" : "Email",
  field_code: code,
  field_type: "multitext",
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

/** Synthetic: a ru account with two pipelines, each with its unsorted (type 1), regular, won (142) and lost (143). */
export const seed = () => {
  const pipelines = [
    {
      id: 5001,
      name: "Продажи",
      sort: 1,
      is_main: true,
      is_unsorted_on: true,
      is_archive: false,
      account_id: 31000001,
    },
    {
      id: 5002,
      name: "Партнёры",
      sort: 2,
      is_main: false,
      is_unsorted_on: true,
      is_archive: false,
      account_id: 31000001,
    },
  ]
  const statuses = pipelines.flatMap((one) => [
    status(one.id * 10, "Неразобранное", one.id, 1, 10),
    status(one.id * 10 + 1, "Первичный контакт", one.id, 0, 20),
    status(142, "Успешно реализовано", one.id, 0, 10000),
    status(143, "Закрыто и не реализовано", one.id, 0, 11000),
  ])
  const lead = (id: number, name: string, pipeline: number, statusId: number, owner: number, contacts: number[]) => ({
    id,
    name,
    price: id * 10,
    responsible_user_id: owner,
    group_id: 0,
    status_id: statusId,
    pipeline_id: pipeline,
    loss_reason_id: null,
    created_by: owner,
    updated_by: owner,
    created_at: 1767225600 + id,
    updated_at: 1767312000 + id,
    closed_at: statusId === 142 || statusId === 143 ? 1767398400 : null,
    closest_task_at: null,
    is_deleted: false,
    custom_fields_values: null,
    score: null,
    account_id: 31000001,
    contacts,
  })
  return {
    account: {
      id: 31000001,
      name: "WireCat Fake Account",
      subdomain: "wirecatfake",
      current_user_id: FAKE_USER_ID,
      country: "RU",
      customers_mode: "disabled",
      is_unsorted_on: true,
      is_loss_reason_enabled: true,
      is_helpbot_enabled: false,
      is_technical_account: true,
      contact_name_display_order: 1,
    },
    users: [
      { id: FAKE_USER_ID, name: "Test Owner", email: "owner@example.test", lang: "ru", rights: { is_admin: true } },
      { id: 7002, name: "Test Colleague", email: "colleague@example.test", lang: "ru", rights: { is_admin: false } },
    ],
    pipelines,
    statuses,
    leads: [
      lead(301, "Test lead one", 5001, 50011, FAKE_USER_ID, [401]),
      lead(302, "Test lead two", 5001, 142, FAKE_USER_ID, [402]),
      lead(303, "Test lead three", 5001, 143, 7002, []),
      lead(304, "Test lead four", 5002, 50020, FAKE_USER_ID, [401, 403]),
    ],
    contacts: [401, 402, 403].map((id, at) => ({
      id,
      name: `Test Person ${at + 1}`,
      first_name: "Test",
      last_name: `Person ${at + 1}`,
      responsible_user_id: at === 2 ? 7002 : FAKE_USER_ID,
      created_at: 1767225600 + id,
      updated_at: 1767312000 + id,
      is_deleted: false,
      custom_fields_values: [
        cf(9001, "PHONE", [[`+7 900 000-00-0${at}`, "WORK"]]),
        cf(9002, "EMAIL", [[`person${at + 1}@example.test`, "WORK"]]),
      ],
      account_id: 31000001,
    })),
    companies: [501, 502].map((id, at) => ({
      id,
      name: `Test Company ${at + 1}`,
      responsible_user_id: FAKE_USER_ID,
      created_at: 1767225600 + id,
      updated_at: 1767312000 + id,
      is_deleted: false,
      custom_fields_values: null,
      account_id: 31000001,
    })),
    customFields: {
      contacts: [
        {
          id: 9001,
          name: "Телефон",
          code: "PHONE",
          type: "multitext",
          sort: 4,
          enums: [{ id: 1, value: "WORK", sort: 2 }],
        },
        {
          id: 9002,
          name: "Email",
          code: "EMAIL",
          type: "multitext",
          sort: 6,
          enums: [{ id: 2, value: "WORK", sort: 2 }],
        },
      ],
      leads: [
        {
          id: 9101,
          name: "Источник",
          code: null,
          type: "select",
          sort: 500,
          enums: [
            { id: 11, value: "Сайт", sort: 1 },
            { id: 12, value: "Звонок", sort: 2 },
          ],
        },
      ],
      companies: [] as Json[],
    } as Record<string, Json[]>,
  }
}

/** No page names the default page size; 50 is what a list without `limit` answers here, an assumption. */
const DEFAULT_LIMIT = 50

type Data = ReturnType<typeof seed>

const page = (call: FakeCall, name: string, all: Json[], href: string) => {
  const ids = call.query["filter[id][]"]
  const matching = ids ? all.filter((one) => ids.includes(String(one.id))) : all
  const limit = Number(call.query.limit?.[0] ?? DEFAULT_LIMIT)
  const at = Number(call.query.page?.[0] ?? 1)
  const items = matching.slice((at - 1) * limit, at * limit)
  if (items.length === 0) return new Response(null, { status: 204 })
  const more = at * limit < matching.length
  return hal({
    _page: at,
    _links: { self: { href }, ...(more ? { next: { href: `${href}?page=${at + 1}&limit=${limit}` } } : {}) },
    _embedded: { [name]: items },
  })
}

const one = (all: Json[], id: string | undefined) => {
  const found = all.find((record) => String(record.id) === id)
  return found ? hal(found) : problem(404, "Not Found", "Entity not found")
}

const withOf = (call: FakeCall) => new Set((call.query.with ?? []).flatMap((value) => value.split(",")))

const leadOut = (call: FakeCall) => (lead: Json) => {
  const { contacts, ...rest } = lead
  return {
    ...rest,
    _embedded: {
      tags: [],
      companies: [],
      ...(withOf(call).has("contacts")
        ? { contacts: (contacts as number[]).map((id, at) => ({ id, is_main: at === 0 })) }
        : {}),
    },
  }
}

/** A create makes each record; an update changes the named ones, and a record that is not there is a 404. */
const leadWrites = (data: Data, now: () => number) => {
  let nextId = 1000
  const created = (items: Json[]) =>
    items.map((item) => {
      const lead = { ...data.leads[0], ...item, id: ++nextId, contacts: [] } as Data["leads"][number]
      data.leads.push(lead)
      return { id: lead.id, request_id: String(item.request_id ?? lead.id) }
    })
  const updated = (items: Json[]) => {
    const found = items.map((item) => data.leads.find((record) => record.id === Number(item.id)))
    if (found.some((lead) => lead === undefined)) return undefined
    return items.map((item, at) => {
      const lead = found[at] as Data["leads"][number]
      Object.assign(lead, item, { updated_at: Math.floor(now() / 1000) })
      return { id: lead.id, updated_at: lead.updated_at }
    })
  }
  const answer = (done: unknown[] | undefined) =>
    done
      ? hal({ _links: { self: { href: `${FAKE_ORIGIN}/api/v4/leads` } }, _embedded: { leads: done } })
      : problem(404, "Not Found", "Entity not found")
  return {
    create: (call: FakeCall) => answer(created(call.body as Json[])),
    update: (call: FakeCall) => answer(updated(call.body as Json[])),
    updateOne: (call: FakeCall, ids: Record<string, string>) =>
      answer(updated([{ ...(call.body as Json), id: Number(ids.id) }])),
  }
}

const handlersFor = (data: Data, options: FakeAmoOptions, now: () => number): Record<string, Handler> => {
  const leads = leadWrites(data, now)
  const refusedUsers = () => problem(403, "Forbidden", "Access denied")
  return {
    "GET /api/v4/account": (call) => {
      const asked = withOf(call)
      return hal({
        ...data.account,
        ...(asked.has("is_api_filter_enabled") ? { is_api_filter_enabled: false } : {}),
        _links: { self: { href: `${FAKE_ORIGIN}/api/v4/account` } },
      })
    },
    "GET /api/v4/users": (call) =>
      options.admin === false ? refusedUsers() : page(call, "users", data.users, `${FAKE_ORIGIN}/api/v4/users`),
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
        `${FAKE_ORIGIN}/api/v4/leads/pipelines/${ids.pipeline_id}/statuses`,
      ),
    "GET /api/v4/leads": (call) => page(call, "leads", data.leads.map(leadOut(call)), `${FAKE_ORIGIN}/api/v4/leads`),
    "GET /api/v4/leads/{id}": (call, ids) => one(data.leads.map(leadOut(call)), ids.id),
    "POST /api/v4/leads": leads.create,
    "PATCH /api/v4/leads": leads.update,
    "PATCH /api/v4/leads/{id}": leads.updateOne,
    "GET /api/v4/contacts": (call) => page(call, "contacts", data.contacts, `${FAKE_ORIGIN}/api/v4/contacts`),
    "GET /api/v4/contacts/{id}": (_, ids) => one(data.contacts, ids.id),
    "GET /api/v4/companies": (call) => page(call, "companies", data.companies, `${FAKE_ORIGIN}/api/v4/companies`),
    "GET /api/v4/companies/{id}": (_, ids) => one(data.companies, ids.id),
    ...Object.fromEntries(
      ["leads", "contacts", "companies"].map((type) => [
        `GET /api/v4/${type}/custom_fields`,
        (call: FakeCall) =>
          page(call, "custom_fields", data.customFields[type] ?? [], `${FAKE_ORIGIN}/api/v4/${type}/custom_fields`),
      ]),
    ),
  }
}

/** A query the operation does not declare, a value of the wrong type, a `with` no page names, a `limit` too big. */
const queryRefusal = (operation: Operation, call: FakeCall): Response | undefined => {
  for (const [name, values] of Object.entries(call.query)) {
    const declared = declaredParameter(operation, name)
    if (declared === undefined) return invalid(name, `${operation.name} takes no ${name}`)
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
  if (body === undefined) return undefined
  if (!operation.body) return invalid("body", `${operation.name} takes no body`)
  const unnamed = missingIds(operation, body)
  if (unnamed.length) return invalid(unnamed, `${operation.name} changes records named by id`, "NotBlank")
  const wrong = bodyProblems(operation, body)
  return wrong.length ? invalid(wrong, `the body does not match ${operation.name}`, "InvalidType") : undefined
}

export const fakeAmo = (options: FakeAmoOptions = {}) => {
  const host = options.host ?? FAKE_HOST
  const data = seed()
  const calls: FakeCall[] = []
  const sent: number[] = []
  const now = options.now ?? Date.now
  let loseNext = options.loseNextWrite === true
  const handlers = { ...handlersFor(data, options, now), ...options.routes }

  const answer = (call: FakeCall, init: RequestInit, url: URL): Response => {
    if (options.blocked) return new Response("<html><body>403 Forbidden</body></html>", { status: 403 })
    const auth = new Headers(init.headers).get("authorization")
    if (auth !== `Bearer ${FAKE_TOKEN}`) return problem(401, "Unauthorized", "Unauthorized")
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
    const refusal = queryRefusal(operation, call) ?? bodyRefusal(operation, call.body)
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

  return { fetch, calls, data }
}

export type FakeAmo = ReturnType<typeof fakeAmo>
