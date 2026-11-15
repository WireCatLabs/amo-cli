import { levelFor } from "@wirecat/cli-core/sends"
import { describe, expect, it } from "vitest"
import { matchOperation, OPERATIONS } from "./amo/operation.js"
import {
  API_DEFAULTS,
  API_KEYS,
  apiDefault,
  apiKey,
  assignsOthers,
  commandKeysOf,
  employeeRuleOf,
  readsClients,
} from "./api-keys.js"
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

  it("gives every operation its default (NEED-2668 A, NEED-2670 A, WC-PERM-22)", () => {
    const own = /^\/api\/v4\/(account|leads|contacts|companies|users|tasks|events)(\/\{id\})?$/
    const ownFields = /^\/api\/v4\/(leads|contacts|companies)\/custom_fields(\/\{id\})?$/
    const pipelines = /^\/api\/v4\/leads\/pipelines(\/\{id\}|\/\{pipeline_id\}\/statuses(\/\{id\})?)?$/
    const records = /^\/api\/v4\/(leads|contacts|companies)(\/\{id\}|\/complex)?$/
    for (const one of OPERATIONS) {
      const t = one.template
      const expected = DENIED.test(t)
        ? "deny"
        : one.effect === "read"
          ? (own.test(t) && t !== "/api/v4/events/{id}") || ownFields.test(t) || pipelines.test(t)
            ? "allow"
            : "ask"
          : ["roles", "sources", "tasks"].includes(one.family) || one.name === "POST /api/v4/users"
            ? "deny"
            : one.effect === "write" && records.test(t) && one.method !== "DELETE"
              ? "allow"
              : "ask"
      expect([one.name, apiDefault(one)]).toEqual([one.name, expected])
      expect([one.name, levelFor({}, apiKey(one), permissions.defaults).level]).toEqual([one.name, expected])
    }
  })

  it.each([
    ["GET /api/v4/leads", "allow"],
    ["GET /api/v4/events", "allow"],
    ["GET /api/v4/events/1", "ask"],
    ["GET /api/v4/leads/notes", "ask"],
    ["GET /api/v4/leads/unsorted", "ask"],
    ["POST /api/v4/leads", "allow"],
    ["PATCH /api/v4/contacts/1", "allow"],
    ["POST /api/v4/leads/notes", "ask"],
    ["DELETE /api/v4/leads/pipelines/1", "ask"],
    ["POST /api/v4/users", "deny"],
    ["POST /api/v4/tasks", "deny"],
    ["PATCH /api/v4/tasks/1", "deny"],
    ["GET /api/v4/tasks", "allow"],
  ])("%s is %s by default", (raw, expected) => {
    expect(level(raw)).toBe(expected)
  })

  it("lifts a denied family with one allow, and a broad allow keeps a write's question", () => {
    expect(level("GET /api/v4/talks")).toBe("deny")
    expect(level("GET /api/v4/talks", { "api.talks": "allow" })).toBe("allow")
    expect(level("POST /api/v4/talks/1/close", { "api.talks": "allow" })).toBe("allow")
    expect(level("POST /api/v4/leads/notes", { api: "allow" })).toBe("ask")
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
    ["POST /api/v4/leads/complex", [{ name: "x" }], ["deals.create", "people.create", "organizations.create"]],
    ["PATCH /api/v4/leads", [{ id: 1, name: "x" }], ["deals.update"]],
    ["PATCH /api/v4/leads/1", { status_id: 142 }, ["deals.update", "deals.move", "deals.close"]],
    ["PATCH /api/v4/leads", [{ id: 1, status_id: 143 }], ["deals.update", "deals.move", "deals.close"]],
    ["PATCH /api/v4/leads/1", { status_id: 50011 }, ["deals.update", "deals.move"]],
    ["PATCH /api/v4/leads/1", { pipeline_id: 5002 }, ["deals.update", "deals.move"]],
    ["POST /api/v4/leads/1/link", [{ to_entity_id: 2, to_entity_type: "contacts" }], ["deals.update"]],
    ["POST /api/v4/contacts/1/unlink", [{ to_entity_id: 2, to_entity_type: "leads" }], ["people.update"]],
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
    expect(assignsOthers(op("POST /api/v4/tasks"), [{ responsible_user_id: 7001 }], () => "7001")).toBe(false)
  })

  it("checks crm.assign-others for tasks and for the contacts and companies nested in a complex lead (SEC-7)", () => {
    expect(assignsOthers(op("POST /api/v4/tasks"), [{ responsible_user_id: 9 }], () => "7001")).toBe(true)
    const nested = [{ name: "x", _embedded: { contacts: [{ first_name: "A", responsible_user_id: 9 }] } }]
    expect(assignsOthers(op("POST /api/v4/leads/complex"), nested, () => "7001")).toBe(true)
    const company = [{ name: "x", _embedded: { companies: [{ name: "B", responsible_user_id: 9 }] } }]
    expect(assignsOthers(op("POST /api/v4/leads/complex"), company, () => "7001")).toBe(true)
  })
})

describe("what only an administrator does (NEED-2669 A, b24's employee rules)", () => {
  it.each([
    ["DELETE /api/v4/leads/pipelines/1", undefined, "delete"],
    ["DELETE /api/v4/leads/unsorted/a1/decline", undefined, "delete"],
    ["POST /api/v4/leads/1/unlink", [{ to_entity_id: 2, to_entity_type: "contacts" }], "unbind"],
    ["PATCH /api/v4/leads/1", { price: null }, "clear"],
    ["PATCH /api/v4/leads", [{ id: 1, name: "" }], "clear"],
    ["PATCH /api/v4/contacts/1", { custom_fields_values: [{ field_code: "PHONE", values: [] }] }, "clear"],
    ["PATCH /api/v4/leads/1", { _embedded: { tags: [] } }, "clear"],
    ["PATCH /api/v4/leads/1", { price: 0 }, undefined],
    ["POST /api/v4/leads", [{ name: "x", price: null }], undefined],
    ["PATCH /api/v4/leads/1", { name: "x" }, undefined],
    ["GET /api/v4/leads", undefined, undefined],
  ])("%s %j is %s", (raw, body, rule) => {
    expect(employeeRuleOf(op(raw), body)).toBe(rule)
  })
})

describe("raw reads of clients, which only an administrator makes (SEC-6, NEED-2660 A)", () => {
  it.each([
    ["GET /api/v4/contacts", {}, true],
    ["GET /api/v4/contacts/1", {}, true],
    ["GET /api/v4/companies", {}, true],
    ["GET /api/v4/contacts/notes", {}, true],
    ["GET /api/v4/companies/1/links", {}, true],
    ["GET /api/v4/leads/unsorted", {}, true],
    ["GET /api/v4/leads", { with: "contacts" }, true],
    ["GET /api/v4/events", { with: "contact_name" }, true],
    ["GET /api/v4/leads", { with: "loss_reason" }, false],
    ["GET /api/v4/leads", {}, false],
    ["GET /api/v4/contacts/custom_fields", {}, false],
    ["GET /api/v4/tasks", {}, false],
  ])("%s %j: %s", (raw, query, reads) => {
    expect(readsClients(op(raw), query)).toBe(reads)
  })
})
