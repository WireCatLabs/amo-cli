import { type Configuration, commandPathKey, commandPermissions, plain, settingsFor } from "@wirecat/cli-core/cli"
import { CRM_WRITE_DEFAULTS, CRM_WRITE_KEYS, crmAlsoChecks } from "@wirecat/cli-core/crm"
import * as v from "valibot"
import { accountOrigin } from "./amo/account.js"
import { API_DEFAULTS, API_KEYS, crmApiKeys } from "./api-keys.js"
import { IDENTITY } from "./identity.js"

/** `api list` and `show` never reach the account; `api call` names its operation only in its arguments and checks it. */
const keyOf = (path: readonly string[]) =>
  path[0] === "api" && ["call", "list", "show"].includes(path[1] ?? "") ? null : commandPathKey(path)

export const permissions = commandPermissions({
  keyOf,
  alsoChecks: crmAlsoChecks(crmApiKeys),
  extra: [...new Set([...CRM_WRITE_KEYS, ...API_KEYS])],
  defaults: { ...CRM_WRITE_DEFAULTS, ...API_DEFAULTS },
})

const isAccount = (text: string) => {
  try {
    accountOrigin(text)
    return true
  } catch {
    return false
  }
}

/** The account the setup flow asks for; a sign-in keeps its own copy of the address, which requests use. */
const PROFILE_ENTRIES = {
  host: v.optional(
    v.pipe(
      v.string(plain("has to be the account's address, in quotes")),
      v.trim(),
      v.check(isAccount, "has to be https://<subdomain>.amocrm.ru or https://<subdomain>.kommo.com"),
    ),
  ),
}

export const configuration: Configuration = settingsFor(IDENTITY, { permissions, profile: PROFILE_ENTRIES })
