import { isCliError } from "@wirecat/cli-base"
import { isRecord } from "./amo/json.js"
import { ROUTES } from "./amo/routes.js"
import type { AmoTransport } from "./amo/transport.js"

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

export interface AccountUser {
  /** The host, as every session answer names it: cli-core's word for the place a sign-in belongs to. */
  account: string
  account_info: { id: string; name: string | null; subdomain: string | null }
  /** b24's fields. amoCRM has no department head: an administrator manages everyone, so `manager` is `admin`. */
  user: { id: string; name: string | null; admin: boolean | null; manager: boolean | null }
}

/**
 * Whose token it is: `/api/v4/account` names the account and `current_user_id`
 * (https://www.amocrm.ru/developers/content/crm_platform/account-info); `/api/v4/users/{id}` the user's name and
 * `rights.is_admin`, which only an administrator may read (users-api): for anyone else both are unknown, not false.
 */
export const accountUser = async (account: AmoTransport): Promise<AccountUser> => {
  const { body } = await account.request({ route: ROUTES.account })
  const about = isRecord(body) ? body : {}
  const userId = String(about.current_user_id ?? "")
  let user: Record<string, unknown> = {}
  try {
    const answer = await account.request({ route: ROUTES.user, ids: { id: userId } })
    if (isRecord(answer.body)) user = answer.body
  } catch (error) {
    if (!isCliError(error) || error.details.reason !== "amo.access-denied") throw error
  }
  const rights = isRecord(user.rights) ? user.rights : {}
  const admin = typeof rights.is_admin === "boolean" ? rights.is_admin : null
  return {
    account: new URL(account.origin).host,
    account_info: { id: String(about.id ?? ""), name: text(about.name), subdomain: text(about.subdomain) },
    user: { id: userId, name: text(user.name), admin, manager: admin },
  }
}
