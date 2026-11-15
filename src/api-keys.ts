import { CRM_ASSIGN_OTHERS_KEY } from "@wirecat/cli-core/crm"
import type { Level } from "@wirecat/cli-core/sends"
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

/** Rights and lead sources change what every user may do or where leads come from: denied method by method. */
const DENIED_WRITES = ["roles", "sources"]

const inFamily = (key: string) => DENIED_FAMILIES.some((family) => key === family || key.startsWith(`${family}.`))

/** Reads allow, writes and deletes ask, the denied families and writes deny (WC-PERM-22). */
export const apiDefault = (operation: Operation): Level => {
  if (inFamily(apiKey(operation))) return "deny"
  if (operation.effect === "read") return "allow"
  if (DENIED_WRITES.includes(operation.family)) return "deny"
  return "ask"
}

const NOUNS: Record<string, string> = { leads: "deals", contacts: "people", companies: "organizations" }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** amoCRM writes take an array of records, or one record on a `/{id}` path. */
const recordsOf = (body: unknown): Record<string, unknown>[] => (Array.isArray(body) ? body : [body]).filter(isRecord)

/** A lead's stage moves with `status_id`, or with `pipeline_id` to another pipeline (Kommo "Updating leads"). */
const movesStage = (body: unknown) =>
  recordsOf(body).some((one) => one.status_id !== undefined || one.pipeline_id !== undefined)

/**
 * The command keys a raw call does the same as, so `api call` cannot get round `deals: deny` (WC-PERM-22). amo's
 * deals, people and organizations commands come with cli-core's CRM commands; their keys hold already.
 */
export const commandKeysOf = (operation: Operation, body?: unknown): string[] => {
  const [noun, ...rest] = operation.template.slice(PREFIX.length).split("/")
  const record = rest.length === 1 && rest[0] === "{id}"
  const owned = NOUNS[noun ?? ""]
  if (owned && (rest.length === 0 || record || rest[0] === "complex")) {
    if (operation.method === "GET") return [`${owned}.${record ? "show" : "list"}`]
    if (operation.method === "POST") return [`${owned}.create`]
    if (operation.method !== "PATCH") return []
    return [`${owned}.update`, ...(owned === "deals" && movesStage(body) ? ["deals.move", "deals.close"] : [])]
  }
  if (operation.method !== "GET") return []
  if (noun === "leads" && rest[0] === "pipelines")
    return [rest.includes("statuses") ? "stages.list" : rest.length > 1 ? "pipelines.show" : "pipelines.list"]
  if (noun === "users" && (rest.length === 0 || record)) return [record ? "users.show" : "users.list"]
  if (owned && rest[0] === "custom_fields") return ["fields.list"]
  return []
}

/** The user a write hands its records to, when it names one other than the token's own (`responsible_user_id`). */
export const assignsOthers = (operation: Operation, body: unknown, self: string | undefined): boolean =>
  operation.effect !== "read" &&
  NOUNS[operation.family] !== undefined &&
  recordsOf(body).some((one) => one.responsible_user_id !== undefined && String(one.responsible_user_id) !== self)

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
