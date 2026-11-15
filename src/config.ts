import { type Configuration, commandPathKey, commandPermissions, settingsFor } from "@wirecat/cli-core/cli"
import { API_DEFAULTS, API_KEYS } from "./api-keys.js"
import { IDENTITY } from "./identity.js"

/** `api list` and `show` never reach the account; `api call` names its operation only in its arguments and checks it. */
const keyOf = (path: readonly string[]) =>
  path[0] === "api" && ["call", "list", "show"].includes(path[1] ?? "") ? null : commandPathKey(path)

export const permissions = commandPermissions({ keyOf, extra: API_KEYS, defaults: API_DEFAULTS })

export const configuration: Configuration = settingsFor(IDENTITY, { permissions })
