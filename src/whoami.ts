import { isCliError } from "@wirecat/cli-base"
import type { AmoTransport } from "./amo/transport.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

export interface AccountUser {
  account: { host: string; id: string; name: string | null; subdomain: string | null }
  user: { id: string; name: string | null; admin: boolean | null }
}

/**
 * Whose token it is: `/api/v4/account` names the account and `current_user_id`
 * (https://www.amocrm.ru/developers/content/crm_platform/account-info); `/api/v4/users/{id}` the user's name and
 * `rights.is_admin`, which only an administrator may read (users-api): for anyone else both are unknown, not false.
 */
export const accountUser = async (account: AmoTransport): Promise<AccountUser> => {
  const { body } = await account.request({ route: "GET /api/v4/account" })
  const about = isRecord(body) ? body : {}
  const userId = String(about.current_user_id ?? "")
  let user: Record<string, unknown> = {}
  try {
    const answer = await account.request({ route: "GET /api/v4/users/{id}", ids: { id: userId } })
    if (isRecord(answer.body)) user = answer.body
  } catch (error) {
    if (!isCliError(error) || error.details.reason !== "amo.access-denied") throw error
  }
  const rights = isRecord(user.rights) ? user.rights : {}
  return {
    account: {
      host: new URL(account.origin).host,
      id: String(about.id ?? ""),
      name: text(about.name),
      subdomain: text(about.subdomain),
    },
    user: {
      id: userId,
      name: text(user.name),
      admin: typeof rights.is_admin === "boolean" ? rights.is_admin : null,
    },
  }
}
