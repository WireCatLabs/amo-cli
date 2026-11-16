import { describe, expect, it } from "vitest"
import { matchOperation, OPERATIONS, pathOf } from "./operation.js"
import { SPEC_OPERATIONS } from "./operations.js"

const named = (raw: string) => matchOperation(raw).operation.name

describe("matchOperation", () => {
  it("finds a concrete path's template, a literal winning over a placeholder", () => {
    expect(named("GET /api/v4/leads/42")).toBe("GET /api/v4/leads/{id}")
    expect(named("GET /api/v4/leads/pipelines")).toBe("GET /api/v4/leads/pipelines")
    expect(named("GET /api/v4/leads/unsorted")).toBe("GET /api/v4/leads/unsorted")
    expect(named("GET /api/v4/leads/custom_fields")).toBe("GET /api/v4/leads/custom_fields")
    expect(named("GET /api/v4/leads/notes")).toBe("GET /api/v4/leads/notes")
    expect(named("PATCH /api/v4/leads")).toBe("PATCH /api/v4/leads")
    expect(named("PATCH /api/v4/leads/42")).toBe("PATCH /api/v4/leads/{id}")
    expect(matchOperation("PATCH /api/v4/leads").operation.summary).toMatch(/lead/i)
  })

  it("keeps a contact's chats in the chats family, never a contact read", () => {
    const chats = matchOperation("GET /api/v4/contacts/chats").operation
    expect(chats.template).toBe("/api/v4/contacts/chats")
    expect(chats.source).toBe("https://developers.kommo.com/reference/get-contact-chats")
  })

  it("spells a Salesbot widget's {bot} out, so its family is named by its value", () => {
    const bot = matchOperation("POST /api/v4/salesbot/1/continue/2").operation
    expect(bot.template).toBe("/api/v4/salesbot/{bot_id}/continue/{continue_id}")
    expect(bot.family).toBe("salesbot")
  })

  it("takes a template as api list prints it, and gives the ids of a concrete path", () => {
    expect(matchOperation("GET /api/v4/leads/{id}").ids).toEqual({})
    const matched = matchOperation(" get  /api/v4/leads/pipelines/5001/statuses/142/ ")
    expect(matched.ids).toEqual({ pipeline_id: "5001", id: "142" })
    expect(pathOf(matched)).toBe("/api/v4/leads/pipelines/5001/statuses/142")
  })

  it.each([
    "GET /api/v4/leads/../users",
    "GET /api/v4/leads/%2e%2e",
    "GET /api/v4/leads?limit=5",
    "GET /api/v4/leads#x",
    "GET /api/v2/events",
    "FETCH /api/v4/leads",
    "/api/v4/leads",
    "GET /api/v4/nothing",
    "DELETE /api/v4/leads",
    "GET /api/v4/leads/abc",
  ])("refuses %s as no operation of the reference", (raw) => {
    expect(() => matchOperation(raw)).toThrow(
      expect.objectContaining({ details: expect.objectContaining({ reason: "api.unknown-method" }) }),
    )
  })
})

describe("the operation table", () => {
  it("holds every /api/v4/ operation of the spec, each with its reference page", () => {
    expect(SPEC_OPERATIONS).toHaveLength(142)
    for (const one of OPERATIONS) expect(one.source).toMatch(/^https:\/\/(developers\.kommo\.com|www\.amocrm\.ru)\//)
    expect(new Set(OPERATIONS.map((one) => one.name)).size).toBe(OPERATIONS.length)
  })

  it("spells each record type out of a {entity_type} path, from the spec's enum where it has one", () => {
    const notes = OPERATIONS.filter((one) => /^\/api\/v4\/\w+\/notes$/.test(one.template) && one.method === "GET")
    expect(notes.map((one) => one.family).sort()).toEqual(["companies", "contacts", "leads"])
    expect(OPERATIONS.some((one) => /\{(entity|entity_type|bot)\}/.test(one.name))).toBe(false)
    expect(matchOperation("PATCH /api/v4/leads").operation.source).toBe(
      "https://developers.kommo.com/reference/updating-leads",
    )
  })
})
