import { describe, expect, it } from "vitest"
import { amoError } from "./errors.js"

const LEADS = "GET /api/v4/leads"

describe("amoError", () => {
  it("answers a refused long-lived token as session.expired, which nothing refreshes", () => {
    expect(amoError(LEADS, 401, {}, { json: true })).toMatchObject({
      code: "authentication_error",
      details: { reason: "session.expired" },
    })
  })

  it("answers a refused OAuth access token as oauth.expired, the reason providerCall refreshes on", () => {
    expect(amoError(LEADS, 401, {}, { json: true, oauth: true })).toMatchObject({
      code: "authentication_error",
      details: { reason: "oauth.expired" },
    })
  })

  it.each([
    ["a bare page", undefined, false, LEADS],
    ["code 113, an address off the allow list", { response: { error_code: "113" } }, true, LEADS],
    ["code 403, blocked for too many requests", { error_code: 403 }, true, LEADS],
    ["any 403 on the account, which no right gates", { title: "Forbidden" }, true, "GET /api/v4/account"],
  ])("tells a block by the documented code: %s", (_, body, json, operation) => {
    expect(amoError(operation, 403, body, { json })).toMatchObject({ details: { reason: "amo.blocked" } })
  })

  it("keeps a rights refusal apart from a block", () => {
    expect(amoError(LEADS, 403, { title: "Forbidden", status: 403 }, { json: true })).toMatchObject({
      details: { reason: "amo.access-denied" },
    })
  })
})
