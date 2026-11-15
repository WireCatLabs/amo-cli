import { defineReasons } from "@wirecat/cli-base/standards"
import { CORE_REASONS } from "@wirecat/cli-core"

/** cli-core's registry refuses a reason listed twice, and core adds reasons of its own over time; its entry wins. */
const CORE = new Set(CORE_REASONS.map((one) => one.reason))

/**
 * amo's own reasons; the shared ones (`offline.refused`, `api.unknown-method`, `session.missing`, `oauth.expired`) are
 * cli-core's.
 */
const OWN: [reason: string, code: string, message: string][] = [
  ["account.malformed", "validation_error", "that is not an amoCRM or Kommo account address"],
  ["account.host-missing", "configuration_error", "AMO_TOKEN needs AMO_HOST, the account's address"],
  ["session.expired", "authentication_error", "amoCRM refused the token: it expired or was revoked"],
  ["session.duplicate", "conflict", "another profile here already signs in to this account as this user"],
  ["amo.subscription-ended", "permission_error", "the amoCRM subscription has ended"],
  ["amo.access-denied", "permission_error", "the token's user may not do this in amoCRM"],
  ["amo.blocked", "permission_error", "amoCRM blocks every request from here"],
  ["amo.filters-off", "validation_error", "the account has no API filter add-on, so amoCRM cannot narrow this list"],
  ["amo.scope-all-refused", "configuration_error", "amo never copies the whole CRM: set the scope to mine"],
  ["body.invalid", "validation_error", "--body or --params is not the JSON this call takes"],
  ["employee.delete", "permission_error", "only an amoCRM administrator deletes through amo"],
  ["employee.clear", "permission_error", "only an amoCRM administrator sets a field to nothing through amo"],
  ["employee.unbind", "permission_error", "only an amoCRM administrator unlinks records through amo"],
]

export const REASONS = defineReasons(
  OWN.filter(([reason]) => !CORE.has(reason)).map(([reason, code, message]) => ({
    reason,
    code,
    message,
    details: [],
  })),
)

/** Detail keys amo's errors carry beyond cli-core's own. */
export const DETAILS = ["fields", "account"]
