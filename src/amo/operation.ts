import { CliError } from "@wirecat/cli-base"
import type { Effect } from "@wirecat/cli-base/codegen"
import { ENTITY_TYPES, EXTRA_OPERATIONS } from "./allow-list.js"
import { SPEC_OPERATIONS } from "./operations.js"

export type HttpVerb = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export type PathParam = { type: "integer" } | { type: "string"; enum?: readonly string[] }

/** One operation as `pnpm kommo:operations` writes it from the spec, or as the allow-list adds it. */
export interface SpecOperation {
  /** `<HTTP verb> <path template>`, the name `api list` prints and `api call` takes. */
  name: string
  effect: Effect
  summary: string
  /** The reference page it comes from. */
  source: string
  path: Readonly<Record<string, PathParam>>
  query: readonly string[]
  body: boolean
}

export interface Operation extends SpecOperation {
  method: HttpVerb
  /** The path template, with a record type named where the spec leaves it a placeholder. */
  template: string
  /** The first word after `/api/v4/`: `leads`, `contacts`, `talks`. */
  family: string
}

const PREFIX = "/api/v4/"

const split = (name: string) => {
  const space = name.indexOf(" ")
  return { method: name.slice(0, space) as HttpVerb, template: name.slice(space + 1) }
}

const expansions = (name: string, path: Readonly<Record<string, PathParam>>): string[] => {
  const free = Object.entries(path).find(
    ([key, param]) =>
      param.type === "string" && (param.enum !== undefined || key === "entity_type" || key === "entity"),
  )
  if (!free) return [name]
  const [key, param] = free
  const values = param.type === "string" && param.enum ? param.enum : ENTITY_TYPES.values
  return values.flatMap((value) =>
    expansions(
      name.replace(`{${key}}`, value),
      Object.fromEntries(Object.entries(path).filter(([one]) => one !== key)),
    ),
  )
}

/**
 * Every operation with its record type spelled out: `GET /api/v4/{entity_type}/notes` is four operations, one per type,
 * so `api.contacts: deny` covers a contact's notes too. A spec path that already names the type (`PATCH
 * /api/v4/leads`, leads update) wins over the same name made from a placeholder (`PATCH /api/v4/{entity_type}`, tags).
 */
const build = (): Operation[] => {
  const byName = new Map<string, Operation>()
  const literal = (one: SpecOperation) => !/\{(entity_type|entity|bot)\}/.test(one.name)
  const ordered = [...SPEC_OPERATIONS, ...EXTRA_OPERATIONS].sort((a, b) => Number(literal(b)) - Number(literal(a)))
  for (const one of ordered)
    for (const name of expansions(one.name, one.path)) {
      if (byName.has(name)) continue
      const { method, template } = split(name)
      const path = Object.fromEntries(Object.entries(one.path).filter(([key]) => template.includes(`{${key}}`)))
      byName.set(name, {
        ...one,
        name,
        path,
        method,
        template,
        family: template.slice(PREFIX.length).split("/")[0] ?? "",
      })
    }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const OPERATIONS: readonly Operation[] = build()

const BY_NAME = new Map(OPERATIONS.map((one) => [one.name, one]))

const SEGMENT = /^[A-Za-z0-9_-]+$/
const VERBS = new Set<string>(["GET", "POST", "PATCH", "PUT", "DELETE"])

const unknownMethod = (message: string) =>
  new CliError("validation_error", message, { reason: "api.unknown-method", param: "<method>" })

const fits = (value: string, param: PathParam | undefined) =>
  param?.type === "integer" ? /^[0-9]+$/.test(value) : param?.enum ? param.enum.includes(value) : SEGMENT.test(value)

/** A literal segment beats a placeholder at the first place two templates differ (OpenAPI 3.1, "Path Templating"). */
const moreLiteral = (a: Operation, b: Operation) => {
  const left = a.template.split("/")
  const right = b.template.split("/")
  for (let at = 0; at < left.length; at++) {
    const x = left[at]?.startsWith("{") ?? false
    const y = right[at]?.startsWith("{") ?? false
    if (x !== y) return x ? 1 : -1
  }
  return 0
}

export interface Matched {
  operation: Operation
  /** The path's ids by placeholder name; the URL is built from the template and these, never from the raw text. */
  ids: Record<string, string>
}

/**
 * `GET /api/v4/leads/42` or the template `GET /api/v4/leads/{id}` to its operation. A path with `.`, `..`, an escape,
 * a query or a fragment is refused before matching, so no text reaches the account other than what a template allows.
 */
export const matchOperation = (raw: string): Matched => {
  const text = raw.trim().replace(/\s+/g, " ")
  const space = text.indexOf(" ")
  const method = text.slice(0, space).toUpperCase()
  const path = text.slice(space + 1).replace(/\/$/, "")
  if (space < 0 || !VERBS.has(method) || !path.startsWith(PREFIX))
    throw unknownMethod(
      'a method is an HTTP verb and an /api/v4/ path, such as "GET /api/v4/leads", as api list prints it',
    )
  const exact = BY_NAME.get(`${method} ${path}`)
  if (exact) return { operation: exact, ids: {} }
  const segments = path.split("/").slice(1)
  if (segments.some((one) => !SEGMENT.test(one)))
    throw unknownMethod(`${method} ${PREFIX}…: each part of the path is letters, digits, _ or -`)
  const found = OPERATIONS.flatMap((operation): Matched[] => {
    if (operation.method !== method) return []
    const parts = operation.template.split("/").slice(1)
    if (parts.length !== segments.length) return []
    const ids: Record<string, string> = {}
    for (const [at, part] of parts.entries()) {
      const value = segments[at] ?? ""
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      if (name === undefined) {
        if (part !== value) return []
      } else if (fits(value, operation.path[name])) ids[name] = value
      else return []
    }
    return [{ operation, ids }]
  }).sort((a, b) => moreLiteral(a.operation, b.operation))
  const first = found[0]
  if (!first)
    throw new CliError("validation_error", `${method} ${path} is not in the Kommo API reference; see api list`, {
      reason: "api.unknown-method",
      param: "<method>",
    })
  return first
}

/** The path to send: the template with each id put in its place. */
export const pathOf = ({ operation, ids }: Matched): string =>
  operation.template.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(ids[name] ?? ""))
