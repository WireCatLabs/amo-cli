import { levelFor } from "@wirecat/cli-core/sends"
import { describe, expect, it } from "vitest"
import { matchOperation, OPERATIONS } from "./amo/operation.js"
import { API_DEFAULTS, API_KEYS, apiDefault, apiKey, assignsOthers, commandKeysOf } from "./api-keys.js"
import { permissions } from "./config.js"

const op = (raw: string) => matchOperation(raw).operation
const level = (raw: string, owner: Record<string, "allow" | "ask" | "deny" | "readonly"> = {}) =>
  levelFor(owner, apiKey(op(raw)), permissions.defaults).level

const DENIED =
  /^\/api\/v4\/(talks|chats|contacts\/chats|bots|salesbot|marketingbot|webhooks|widgets|website_buttons|calls|users\/(activate|deactivate))(\/|$)/

describe("permission keys", () => {
  it("names an operation by its path's words, then its verb", () => {
    expect(apiKey(op("GET /api/v4/leads"))).toBe("api.leads.get")
    expect(apiKey(op("GET /api/v4/leads/42"))).toBe("api.leads.id.get")
    expect(apiKey(op("GET /api/v4/contacts/notes"))).toBe("api.contacts.notes.get")
    expect(new Set(OPERATIONS.map(apiKey)).size).toBe(OPERATIONS.length)
  })

  it("gives every operation its default: reads allow, writes and deletes ask, the families and rights deny", () => {
    for (const one of OPERATIONS) {
      const expected = DENIED.test(one.template)
        ? "deny"
        : one.effect !== "read" && ["roles", "sources"].includes(one.family)
          ? "deny"
          : one.effect === "read"
            ? "allow"
            : "ask"
      expect([one.name, apiDefault(one)]).toEqual([one.name, expected])
      expect([one.name, levelFor({}, apiKey(one), permissions.defaults).level]).toEqual([one.name, expected])
    }
  })

  it("lifts a denied family with one allow, and a broad allow keeps a write's question", () => {
    expect(level("GET /api/v4/talks")).toBe("deny")
    expect(level("GET /api/v4/talks", { "api.talks": "allow" })).toBe("allow")
    expect(level("POST /api/v4/talks/1/close", { "api.talks": "allow" })).toBe("allow")
    expect(level("PATCH /api/v4/leads/1", { api: "allow" })).toBe("ask")
    expect(level("GET /api/v4/contacts/notes", { "api.contacts": "deny" })).toBe("deny")
  })

  it("lists every key the config may name, each operation's among them", () => {
    for (const one of OPERATIONS) expect(API_KEYS).toContain(apiKey(one))
    expect(API_DEFAULTS["crm.assign-others"]).toBe("deny")
  })
})

describe("command keys a raw call does the same as", () => {
  it.each([
    ["GET /api/v4/leads", undefined, ["deals.list"]],
    ["GET /api/v4/leads/1", undefined, ["deals.show"]],
    ["POST /api/v4/leads", [{ name: "x" }], ["deals.create"]],
    ["POST /api/v4/leads/complex", [{ name: "x" }], ["deals.create"]],
    ["PATCH /api/v4/leads", [{ id: 1, name: "x" }], ["deals.update"]],
    ["PATCH /api/v4/leads/1", { status_id: 142 }, ["deals.update", "deals.move", "deals.close"]],
    ["GET /api/v4/contacts/1", undefined, ["people.show"]],
    ["PATCH /api/v4/companies/1", { name: "x" }, ["organizations.update"]],
    ["GET /api/v4/leads/pipelines", undefined, ["pipelines.list"]],
    ["GET /api/v4/leads/pipelines/1", undefined, ["pipelines.show"]],
    ["GET /api/v4/leads/pipelines/1/statuses", undefined, ["stages.list"]],
    ["GET /api/v4/users", undefined, ["users.list"]],
    ["GET /api/v4/users/1", undefined, ["users.show"]],
    ["GET /api/v4/contacts/custom_fields", undefined, ["fields.list"]],
    ["GET /api/v4/tasks", undefined, []],
    ["POST /api/v4/tasks", [{ text: "x" }], []],
  ])("%s", (raw, body, keys) => {
    expect(commandKeysOf(op(raw), body)).toEqual(keys)
  })

  it("checks crm.assign-others when a write hands a record to another user", () => {
    expect(assignsOthers(op("PATCH /api/v4/leads"), [{ id: 1, responsible_user_id: 9 }], () => "7001")).toBe(true)
    expect(assignsOthers(op("PATCH /api/v4/leads"), [{ id: 1, responsible_user_id: 7001 }], () => "7001")).toBe(false)
    expect(assignsOthers(op("GET /api/v4/leads"), undefined, () => "7001")).toBe(false)
    expect(assignsOthers(op("POST /api/v4/tasks"), [{ responsible_user_id: 9 }], () => "7001")).toBe(false)
  })
})
