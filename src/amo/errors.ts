import { CliError, type CliErrorDetails, type ErrorCode } from "@wirecat/cli-base"
import { retryableStatus, statusToCode } from "@wirecat/cli-base/http"
import { isRecord } from "./json.js"

/*
 * amoCRM answers a refusal as problem+json: `title`, `type`, `status`, `detail`, and on a validation failure
 * `validation-errors: [{ request_id, errors: [{ code, path, detail }] }]`
 * (https://www.amocrm.ru/developers/content/crm_platform/error-codes, https://developers.kommo.com/docs/http-codes).
 * The limits and what 402 and 403 mean are on https://www.amocrm.ru/developers/content/api/recommendations.
 *
 * A block of every request is a 403 too. The ru error-codes page lists code 113 (403, "access to this account is
 * forbidden from your IP address") and 403 ("the account is blocked for repeatedly exceeding the requests a second");
 * Kommo's http-codes page shows the block as a bare `403 Forbidden` page. Neither names the body field, so the code is
 * read where amoCRM's other answers put one: `error_code`, at the top or under `response`.
 */

/** Kommo's 429 example carries `retry_after` in seconds; without it, a second, the limit's own window. */
const RATE_WAIT_MS = 1_000

const CODE = /^[A-Za-z0-9_.[\]-]{1,128}$/

/** Only code-shaped paths and codes: a `detail` can quote a value somebody typed (WC-SECR-6). */
const validationOf = (body: unknown) => {
  const groups = isRecord(body) ? body["validation-errors"] : undefined
  const errors = (Array.isArray(groups) ? groups : []).flatMap((group) =>
    isRecord(group) && Array.isArray(group.errors) ? group.errors.filter(isRecord) : [],
  )
  const pick = (key: string) =>
    errors.map((one) => one[key]).filter((one): one is string => typeof one === "string" && CODE.test(one))
  return { fields: [...new Set(pick("path"))], codes: [...new Set(pick("code"))] }
}

/** The documented codes of a block (error-codes: 113 address not allowed, 403 blocked for the rate). */
const BLOCK_CODES = new Set(["113", "403"])
/** No user right gates the account itself, so a refusal of it is a block. */
const UNGATED = "GET /api/v4/account"

const codeOf = (body: unknown): string | undefined => {
  const holder = isRecord(body) && isRecord(body.response) ? body.response : body
  const code = isRecord(holder) ? holder.error_code : undefined
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined
}

export const isBlock = (operation: string, body: unknown, json: boolean): boolean =>
  !json || operation === UNGATED || BLOCK_CODES.has(codeOf(body) ?? "")

export interface Refusal {
  /** Whether the answer was JSON at all: a block's 403 is a bare page. */
  json: boolean
  waitMs?: number | undefined
  /** An OAuth access token, which a refresh renews; a long-lived token has nothing to refresh it with. */
  oauth?: boolean
}

/** amoCRM's refusal as a stable code and reason a script branches on; the message never repeats amoCRM's text. */
export const amoError = (
  operation: string,
  status: number,
  body: unknown,
  { json, waitMs, oauth = false }: Refusal,
): CliError => {
  const details: CliErrorDetails = { operation, status }
  const as = (code: ErrorCode, message: string, more: CliErrorDetails = {}) =>
    new CliError(code, message, { ...details, ...more })

  if (status === 401 && oauth)
    return as("authentication_error", "amoCRM refused the access token; it is renewed with the refresh token", {
      reason: "oauth.expired",
    })
  if (status === 401)
    return as(
      "authentication_error",
      "amoCRM refused the token: it expired, was revoked, or the account address is wrong. Make a new long-lived " +
        "token and sign in again with `amo <profile> session start`",
      { reason: "session.expired" },
    )
  if (status === 402)
    return as(
      "permission_error",
      "the amoCRM subscription has ended: writes stop at once, and reads 30 days later. Renew it in amoCRM",
      { reason: "amo.subscription-ended" },
    )
  if (status === 403 && isBlock(operation, body, json))
    return as(
      "permission_error",
      "amoCRM blocks every request from here (too many requests, or an address not on the account's allow list). " +
        "Stop all amo commands on this account and check it in amoCRM before trying again",
      { reason: "amo.blocked", retryable: false },
    )
  if (status === 403)
    return as("permission_error", `the token's user may not do ${operation} in amoCRM`, { reason: "amo.access-denied" })
  if (status === 429) {
    const after = isRecord(body) && typeof body.retry_after === "number" ? body.retry_after * 1000 : undefined
    return as("rate_limited", `amoCRM asks to slow down before ${operation}`, {
      retry_after_ms: waitMs ?? after ?? RATE_WAIT_MS,
      retryable: true,
    })
  }
  if (status === 404) return as("not_found", `${operation}: amoCRM has no such record, or this token cannot see it`)
  if (status === 400 || status === 422) {
    const { fields, codes } = validationOf(body)
    return as(
      "validation_error",
      `amoCRM refused ${operation}${fields.length ? `; check ${fields.join(", ")}` : ""}`,
      fields.length ? { fields, ...(codes.length ? { provider_error: codes.join(",") } : {}) } : {},
    )
  }
  if (status >= 500)
    return as("provider_unavailable", `amoCRM failed on ${operation} (HTTP ${status})`, {
      retryable: retryableStatus(status),
    })
  return as(status >= 400 ? statusToCode(status) : "provider_error", `amoCRM refused ${operation} (HTTP ${status})`)
}
