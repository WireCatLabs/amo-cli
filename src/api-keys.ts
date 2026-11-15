import { CRM_ASSIGN_OTHERS_KEY } from "@wirecat/cli-core/crm"
import type { Level } from "@wirecat/cli-core/sends"
import { isRecord } from "./amo/json.js"
import { OPERATIONS, type Operation } from "./amo/operation.js"

const PREFIX = "/api/v4/"

/** `GET /api/v4/leads/{id}` → `api.leads.id.get`: the path's words, then the verb, so a family is a key's parent. */
export const apiKey = (operation: Operation): string =>
  [
    "api",
    ...operation.template
      .slice(PREFIX.length)
      .split("/")
      .map((part) => part.replace(/^\{(\w+)\}$/, "$1")),
    operation.method.toLowerCase(),
  ].join(".")

/**
 * Families whose calls reach people, publish or start the account's own automation, denied, reads too, until the
 * owner allows them: conversations and chats (they send messages), Salesbots, webhooks (they send account data to a
 * URL), widgets, the website buttons and calls (each a channel that takes in people's messages), and switching users
 * on and off. Each is the key of its path, so `api.talks: allow` lifts the whole family.
 */
export const DENIED_FAMILIES = [
  "talks",
  "chats",
  "contacts.chats",
  "bots",
  "salesbot",
  "marketingbot",
  "webhooks",
  "widgets",
  "website_buttons",
  "calls",
  "users.activate",
  "users.deactivate",
].map((family) => `api.${family}`)

/**
 * Writes denied one by one: rights and lead sources change what every user may do or where leads come from; adding a
 * user gives a new person the whole account, and a task tells its assignee (NEED-2670 A, as b24's `user.add` and
 * `tasks`). Reads of these stay open.
 */
const DENIED_WRITE_FAMILIES = ["roles", "sources", "tasks"]
const DENIED_WRITES = ["POST /api/v4/users"]

const inFamily = (key: string) => DENIED_FAMILIES.some((family) => key === family || key.startsWith(`${family}.`))

const ONE = "(/\\{id\\})?"
/**
 * The reads amo's own commands and sync make, allowed; every other read asks (NEED-2668 A): notes and events hold
 * calls, SMS and chat text, unsorted holds what forms and mail brought in, and an event's detail is a record of it.
 */
const OWN_READS = [
  `/account`,
  `/(leads|contacts|companies|users|tasks)${ONE}`,
  `/events`,
  `/(leads|contacts|companies)/custom_fields${ONE}`,
  `/leads/pipelines${ONE}`,
  `/leads/pipelines/\\{pipeline_id\\}/statuses${ONE}`,
].map((pattern) => new RegExp(`^${PREFIX.slice(0, -1)}${pattern}$`))

/** An ordinary change to a deal, a contact or a company: `allow`, as b24's CRM writes (WC-PERM-22). */
const RECORD_WRITES = new RegExp(`^${PREFIX}(leads|contacts|companies)(/\\{id\\}|/complex)?$`)

/** The denied families and writes deny; own reads and record changes allow; other reads, writes and deletes ask. */
export const apiDefault = (operation: Operation): Level => {
  if (inFamily(apiKey(operation))) return "deny"
  if (operation.effect === "read") return OWN_READS.some((one) => one.test(operation.template)) ? "allow" : "ask"
  if (DENIED_WRITE_FAMILIES.includes(operation.family) || DENIED_WRITES.includes(operation.name)) return "deny"
  if (operation.effect === "write" && RECORD_WRITES.test(operation.template)) return "allow"
  return "ask"
}

const NOUNS: Record<string, string> = { leads: "deals", contacts: "people", companies: "organizations" }

/** amoCRM writes take an array of records, or one record on a `/{id}` path. */
const recordsOf = (body: unknown): Record<string, unknown>[] => (Array.isArray(body) ? body : [body]).filter(isRecord)

/** A complex lead carries its new contacts and company under `_embedded` (Kommo "Adding complex leads"). */
const nestedOf = (record: Record<string, unknown>): Record<string, unknown>[] => {
  const inside = isRecord(record._embedded) ? record._embedded : {}
  return [...recordsOf(inside.contacts), ...recordsOf(inside.companies)]
}

/** amoCRM's won and lost statuses, the same ids in every pipeline (leads_pipelines). */
const CLOSED = new Set(["142", "143"])

/**
 * The command keys a raw call does the same as, so `api call` cannot get round `deals: deny` (WC-PERM-22). amo's
 * deals, people and organizations commands come with cli-core's CRM commands; their keys hold already. A stage move
 * is `deals.move`, and to 142 or 143 `deals.close` too.
 */
export const commandKeysOf = (operation: Operation, body?: unknown): string[] => {
  const [noun, ...rest] = operation.template.slice(PREFIX.length).split("/")
  const record = rest.length === 1 && rest[0] === "{id}"
  const owned = NOUNS[noun ?? ""]
  if (owned && operation.method === "POST" && rest.length === 2 && /^(link|unlink)$/.test(rest[1] ?? ""))
    return [`${owned}.update`]
  if (owned && rest[0] === "complex" && operation.method === "POST")
    return ["deals.create", "people.create", "organizations.create"]
  if (owned && (rest.length === 0 || record)) {
    if (operation.method === "GET") return [`${owned}.${record ? "show" : "list"}`]
    if (operation.method === "POST") return [`${owned}.create`]
    if (operation.method !== "PATCH") return []
    const records = recordsOf(body)
    const moves =
      owned === "deals" && records.some((one) => one.status_id !== undefined || one.pipeline_id !== undefined)
    const closes = owned === "deals" && records.some((one) => CLOSED.has(String(one.status_id)))
    return [`${owned}.update`, ...(moves ? ["deals.move"] : []), ...(closes ? ["deals.close"] : [])]
  }
  if (operation.method !== "GET") return []
  if (noun === "leads" && rest[0] === "pipelines")
    return [rest.includes("statuses") ? "stages.list" : rest.length > 1 ? "pipelines.show" : "pipelines.list"]
  if (noun === "users" && (rest.length === 0 || record)) return [record ? "users.show" : "users.list"]
  if (owned && rest[0] === "custom_fields") return ["fields.list"]
  return []
}

const ASSIGNED = new Set(["leads", "contacts", "companies", "tasks"])

/** `self` is asked only when a record names a responsible user, so a refused call never reads the sign-in. */
export const assignsOthers = (operation: Operation, body: unknown, self: () => string | undefined): boolean => {
  if (operation.effect === "read" || !ASSIGNED.has(operation.family)) return false
  const named = recordsOf(body)
    .flatMap((one) => [one, ...nestedOf(one)])
    .filter((one) => one.responsible_user_id !== undefined)
  if (named.length === 0) return false
  const me = self()
  return named.some((one) => String(one.responsible_user_id) !== me)
}

/** Where contact data comes back: contacts and companies with their notes and links, and what names or embeds them. */
const CLIENT_WITH = new Set(["contacts", "companies", "contact_name", "company_name", "customer_name"])

/**
 * A raw read that returns contacts or companies, or their contact data: for anyone but an administrator `api call`
 * refuses it whatever the permissions say (NEED-2660 A, b24's NEED-2488), since one list call would hand over the
 * whole client base past the day's limit. Field definitions name no client and stay open; a lead's own fields hold
 * its contacts' ids only, so a lead read is a client read only when it embeds them.
 */
export const readsClients = (operation: Operation, query: Readonly<Record<string, unknown>> = {}): boolean => {
  if (operation.effect !== "read") return false
  const rest = operation.template.slice(PREFIX.length).split("/")
  if ((operation.family === "contacts" || operation.family === "companies") && rest[1] !== "custom_fields") return true
  if (operation.family === "leads" && rest[1] === "unsorted") return true
  const asked = query.with
  const words = (Array.isArray(asked) ? asked : [asked]).flatMap((one) => String(one ?? "").split(","))
  return words.some((one) => CLIENT_WITH.has(one.trim()))
}

export type EmployeeRule = "delete" | "clear" | "unbind"

/** An empty value anywhere in it: `null`, `""`, `[]`, or a field's `values: []`. */
const clears = (value: unknown): boolean => {
  if (value === null || (typeof value === "string" && value.trim() === "")) return true
  if (Array.isArray(value)) return value.length === 0 || value.some(clears)
  return isRecord(value) && Object.values(value).some(clears)
}

/**
 * What only an administrator may send, whatever the permissions say (NEED-2669 A, b24's rule of 2026-11-10): a
 * delete, an update that sets any field to nothing, and an unlink. Whether the field held a value would cost a read
 * per write, so any empty value in an update is refused; a create may leave fields empty. amoCRM has no merge call.
 */
export const employeeRuleOf = (operation: Operation, body: unknown): EmployeeRule | undefined => {
  if (operation.effect === "destructive") return "delete"
  if (operation.method === "POST" && operation.template.endsWith("/unlink")) return "unbind"
  if (operation.method !== "PATCH" && operation.method !== "PUT") return undefined
  const changed = recordsOf(body).flatMap((one) => Object.entries(one).filter(([key]) => key !== "id"))
  return changed.some(([, value]) => clears(value)) ? "clear" : undefined
}

const COMMAND_KEYS = [
  ...["deals", "people", "organizations"].flatMap((noun) =>
    ["list", "show", "create", "update"].map((verb) => `${noun}.${verb}`),
  ),
  "deals.move",
  "deals.close",
  "pipelines.list",
  "pipelines.show",
  "stages.list",
  "users.list",
  "users.show",
  "fields.list",
]

/** The keys `permissions` may name for `api` and the commands it maps onto. */
export const API_KEYS: readonly string[] = [
  ...OPERATIONS.map(apiKey),
  ...DENIED_FAMILIES,
  ...COMMAND_KEYS,
  CRM_ASSIGN_OTHERS_KEY,
]

/** Only what differs from allow; a denied family's members inherit its `deny`, so one `allow` lifts them all. */
export const API_DEFAULTS: Readonly<Record<string, Level>> = {
  ...Object.fromEntries(
    OPERATIONS.filter((one) => !inFamily(apiKey(one)) && apiDefault(one) !== "allow").map((one) => [
      apiKey(one),
      apiDefault(one),
    ]),
  ),
  ...Object.fromEntries(DENIED_FAMILIES.map((family) => [family, "deny" satisfies Level])),
  [CRM_ASSIGN_OTHERS_KEY]: "deny",
}
