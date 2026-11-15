import { CliError } from "@wirecat/cli-base"
import { isRecord } from "./json.js"

/**
 * Account hosts: `<subdomain>.amocrm.ru` (amoCRM), `<subdomain>.kommo.com` and the older `<subdomain>.amocrm.com`
 * (Kommo), never the shared `www` (amocrm.ru developers "Рекомендации", developers.kommo.com "Limitations").
 */
export const ACCOUNT_DOMAINS = ["amocrm.ru", "amocrm.com", "kommo.com"] as const

const HOST = new RegExp(
  `^(?!www\\.)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.(${ACCOUNT_DOMAINS.join("|").replaceAll(".", "\\.")})$`,
)

/** One account: the address the owner gave, kept exactly (amocrm.com is never turned into kommo.com), and its token. */
export interface AmoSignIn {
  origin: string
  token: string
  /** The token's user, learnt at sign-in; absent for `AMO_TOKEN`. */
  userId?: string
  /** An OAuth access token, which expires and is refreshed; absent for a long-lived token, which nothing renews. */
  oauth?: true
}

/** `https://example.amocrm.ru`, `example.kommo.com/`: the account's origin, or a refusal that quotes nothing back. */
export const accountOrigin = (raw: string): string => {
  const refused = (why: string) =>
    new CliError(
      "validation_error",
      `--host takes the account's address, such as https://example.amocrm.ru or https://example.kommo.com: ${why}`,
      { reason: "account.malformed", param: "--host" },
    )
  const text = raw.trim()
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    throw refused("it is not an address")
  }
  if (url.protocol !== "https:") throw refused("it must be https")
  if (url.username || url.password || url.port || url.search || url.hash || (url.pathname !== "/" && url.pathname))
    throw refused("it carries more than the account's host")
  if (!HOST.test(url.hostname)) throw refused(`the host is not <subdomain>.${ACCOUNT_DOMAINS.join(", .")}`)
  return url.origin
}

/** The keyring holds the address beside the token, so one entry is the whole sign-in, as b24's webhook address is. */
export const encodeSignIn = (signIn: AmoSignIn): string => JSON.stringify(signIn)

export const decodeSignIn = (secret: string): AmoSignIn => {
  let value: unknown
  try {
    value = JSON.parse(secret)
  } catch {
    value = undefined
  }
  if (!isRecord(value) || typeof value.origin !== "string" || typeof value.token !== "string")
    throw new CliError(
      "configuration_error",
      "the saved sign-in is not one amo wrote; sign in again with session start",
      {
        reason: "account.malformed",
      },
    )
  return {
    origin: accountOrigin(value.origin),
    token: value.token,
    ...(typeof value.userId === "string" ? { userId: value.userId } : {}),
    ...(value.oauth === true ? { oauth: true as const } : {}),
  }
}
