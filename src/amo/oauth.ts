import {
  CliError,
  type CredentialStorage,
  Credentials,
  isMovedRun,
  type KeyringStore,
  resolvePaths,
  systemKeyring,
} from "@wirecat/cli-base"
import { hostFetch } from "@wirecat/cli-base/http"
import { timeLimit } from "@wirecat/cli-core/cli"
import {
  accountTokenCodec,
  credentialStorage,
  type ExchangeContext,
  type OAuthClient,
  type OAuthProvider,
  oauthAccount,
  type SignInOptions as SignInSteps,
  type TokenCodec,
  type TokenSet,
  type TokenStorage,
  tokenKeeper,
} from "@wirecat/cli-core/oauth"
import { IDENTITY } from "../identity.js"
import { accountOrigin } from "./account.js"
import { isRecord } from "./json.js"

export const PROVIDER = "amocrm"
/**
 * The Redirect URI of an integration the owner creates for `--client-id`, which amoCRM sends the browser to with
 * `code` and `state` (amocrm.ru developers oauth/step-by-step). The static page forwards any `code` and `state` to the
 * waiting local port (cli-docs public/webhooks/apps/amo-callback.html).
 */
export const RELAY_URL = "https://wirecat.dev/webhooks/apps/amo-callback"
/**
 * The one-click sign-in runs on connect.wirecat.dev, a server in Russia (cli-docs services/amo-connect): amoCRM's
 * servers post the new integration's keys from Russia, where Cloudflare, which serves wirecat.dev, is blocked.
 */
const CONNECT_ORIGIN = "https://connect.wirecat.dev"
/** The Redirect URI amoCRM's button gives the integration it creates; the same page as RELAY_URL, on that server. */
export const BUTTON_RELAY_URL = `${CONNECT_ORIGIN}/webhooks/apps/amo-callback`
/** The page with amoCRM's button, which reads `state` from the fragment (cli-docs services/amo-connect). */
export const CONNECT_PAGE_URL = `${CONNECT_ORIGIN}/connect/amo.html`
/** Hands over once the keys amoCRM posted for a `state`. */
export const CLAIM_URL = `${CONNECT_ORIGIN}/api/amo/claim`
const REQUEST_MS = 30_000
const HINT = /^[\w .,:'`-]{1,200}$/

/** A sign-in through the owner's own integration: the account, the user whose rights it carries, and the token. */
export interface AppAuth {
  origin: string
  userId: string
  accessToken: (refresh: boolean) => Promise<string>
}

const account = accountTokenCodec(PROVIDER)

/**
 * cli-core's account-bound entry, plus the Redirect URI it was signed in with: every refresh sends the same one, and
 * amoCRM refuses one that differs from the integration's setting (oauth/step-by-step).
 */
export const appCodec: TokenCodec = {
  rotating: true,
  encode: account.encode,
  decode: (raw) => {
    const stored = account.decode(raw)
    const entry: unknown = JSON.parse(raw)
    const redirectUri = isRecord(entry) && typeof entry.redirectUri === "string" ? entry.redirectUri : RELAY_URL
    return Object.assign(stored, { redirectUri, browser: isRecord(entry) && entry.browser === true })
  },
}

const paths = (env: NodeJS.ProcessEnv) => resolvePaths({ appName: IDENTITY.appName, prefix: IDENTITY.envPrefix, env })

/** The folder cli-core's sign-in lock lives in, beside the config. */
export const lockDirOf = (env: NodeJS.ProcessEnv) => paths(env).config

const credentialsOf = (env: NodeJS.ProcessEnv, keyring: KeyringStore | undefined, storage: CredentialStorage) => ({
  configDir: paths(env).config,
  service: IDENTITY.appName,
  storage,
  env,
  isolated: isMovedRun({ appName: IDENTITY.appName, prefix: IDENTITY.envPrefix, env }),
  // cli-core's sign-in store takes no default keyring; a test hands its memory keyring here instead.
  keyring: keyring ?? systemKeyring,
})

/** The same service, folder and moved-run rule as the long-lived token's `ProfileTokenStore`, under `oauth:amocrm:<profile>`. */
export const appStorage = (
  env: NodeJS.ProcessEnv,
  profile: string,
  keyring?: KeyringStore,
  storage: CredentialStorage = "auto",
): TokenStorage =>
  credentialStorage({
    credentials: credentialsOf(env, keyring, storage),
    account: oauthAccount(PROVIDER, profile),
    codec: appCodec,
  })

/** Where the integration's sign-in is kept, `keyring` or `file`, and never what. */
export const appSourceOf = (env: NodeJS.ProcessEnv, profile: string, keyring?: KeyringStore) =>
  new Credentials(credentialsOf(env, keyring, "auto")).read(oauthAccount(PROVIDER, profile))?.source

/** ru accounts sign in at amocrm.ru, Kommo and the older amocrm.com accounts at kommo.com (oauth/step-by-step; Kommo oauth-20). */
const authorizeUrlOf = (origin: string) =>
  new URL(origin).hostname.endsWith(".amocrm.ru") ? "https://www.amocrm.ru/oauth" : "https://www.kommo.com/oauth"

const refusal = (status: number, body: unknown, again: string): CliError => {
  if (status === 429 || status >= 500)
    return new CliError("provider_unavailable", `amoCRM's sign-in failed (HTTP ${status})`, {
      status,
      retryable: true,
      reason: "oauth.unavailable",
    })
  // Kommo get-token: a 400 names the cause in `hint` (code expired, wrong client_id, Redirect URI mismatch).
  const hint = isRecord(body) && typeof body.hint === "string" && HINT.test(body.hint) ? ` (${body.hint})` : ""
  return new CliError("authentication_error", `amoCRM refused the sign-in${hint}; ${again}`, {
    status,
    reason: "oauth.expired",
  })
}

/**
 * `POST /oauth2/access_token` on the account's own host with a JSON body (oauth/step-by-step; Kommo get-token), which
 * cli-core's form POST is not. Only the spec's fields go: amoCRM takes no PKCE `code_verifier`. No failure quotes
 * the request or the answer, which hold the code, the secret or a token.
 */
const exchange = async (
  origin: string,
  redirectUri: string,
  params: Record<string, string>,
  context: ExchangeContext,
): Promise<TokenSet> => {
  const refresh = params.grant_type === "refresh_token"
  const again = `run ${context.signInCommand} again`
  const body = {
    client_id: context.client.clientId,
    client_secret: context.client.clientSecret ?? "",
    grant_type: refresh ? "refresh_token" : "authorization_code",
    ...(refresh ? { refresh_token: params.refresh_token ?? "" } : { code: params.code ?? "" }),
    redirect_uri: redirectUri,
  }
  const deadline = timeLimit(REQUEST_MS)
  const signal = context.signal ? AbortSignal.any([context.signal, deadline.signal]) : deadline.signal
  try {
    let response: Response
    try {
      response = await hostFetch({ hosts: [new URL(origin).hostname], fetch: context.fetch, timeoutMs: REQUEST_MS })(
        `${origin}/oauth2/access_token`,
        {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify(body),
          redirect: "error",
          signal,
        },
      )
    } catch {
      if (context.signal?.aborted) throw new CliError("cancelled", "the amoCRM sign-in was cancelled")
      throw new CliError("outcome_unknown", `amoCRM's token request did not finish; ${again} if it keeps failing`, {
        reason: "oauth.no-response",
      })
    }
    const answer: unknown = await response.json().catch(() => undefined)
    if (!response.ok) throw refusal(response.status, answer, again)
    const fields = isRecord(answer) ? answer : {}
    const { access_token: access, refresh_token: next, expires_in: expiresIn, token_type: tokenType } = fields
    if (
      typeof access !== "string" ||
      !access ||
      typeof next !== "string" ||
      !next ||
      typeof expiresIn !== "number" ||
      !(expiresIn > 0)
    )
      throw new CliError("invalid_response", `amoCRM returned a token answer amo cannot use; ${again}`, {
        reason: "oauth.invalid-response",
      })
    return {
      accessToken: access,
      refreshToken: next,
      expiresAt: context.now() + expiresIn * 1000,
      scopes: [],
      ...(typeof tokenType === "string" ? { tokenType } : {}),
    }
  } finally {
    deadline.clear()
  }
}

export const appProvider = (origin: string, client: OAuthClient, redirectUri: string = RELAY_URL): OAuthProvider => ({
  id: PROVIDER,
  name: "amoCRM",
  authorizeUrl: authorizeUrlOf(origin),
  tokenUrl: `${origin}/oauth2/access_token`,
  client,
  redirect: { kind: "relay", url: redirectUri },
  // `post_message` sends the redirect to the window the sign-in was opened in, here the browser's tab (oauth/step-by-step).
  authorizeParams: { mode: "post_message" },
  exchange: (params, context) => exchange(origin, redirectUri, params, context),
})

export const fetchFor = (origin: string, given?: typeof fetch) =>
  given ?? hostFetch({ hosts: [new URL(origin).hostname], timeoutMs: REQUEST_MS })

export interface AppSignInOptions<T> {
  env: NodeJS.ProcessEnv
  profile: string
  origin: string
  client: OAuthClient
  storage: "keyring" | "file"
  keyring?: KeyringStore | undefined
  fetch?: typeof fetch | undefined
  signal?: AbortSignal | undefined
  signInCommand: string
  steps: Omit<SignInSteps, "scopes" | "accept">
  /** Whose rights the new tokens carry, asked of the account before anything is kept. */
  check: (auth: AppAuth) => Promise<T>
}

/**
 * The integration's sign-in: authorize in the browser, exchange the code on the account the owner named, ask that
 * account who it is, then keep it. A code from another account fails there, before anything is saved.
 */
export const appSignIn = async <T extends { id: string }>(options: AppSignInOptions<T>): Promise<T> => {
  let user: T | undefined
  const keeper = tokenKeeper({
    provider: appProvider(options.origin, options.client),
    storage: appStorage(options.env, options.profile, options.keyring, options.storage === "file" ? "file" : "auto"),
    lockDir: paths(options.env).config,
    fetch: fetchFor(options.origin, options.fetch),
    signInCommand: options.signInCommand,
    ...(options.signal ? { signal: options.signal } : {}),
  })
  await keeper.signIn({
    ...options.steps,
    // The integration's card holds the scopes; amoCRM takes no `scope` in the request.
    scopes: [],
    accept: async (tokens) => {
      const token = tokens.accessToken ?? ""
      user = await options.check({ origin: options.origin, userId: "", accessToken: async () => token })
      return { host: options.origin, userId: user.id, redirectUri: RELAY_URL }
    },
  })
  if (!user) throw new CliError("authentication_error", "amoCRM did not say whose sign-in this is")
  return user
}

/** The profile's integration sign-in, refreshed under cli-core's shared lock; none when the profile has none. */
export const appAuthOf = (options: {
  env: NodeJS.ProcessEnv
  profile: string
  keyring?: KeyringStore | undefined
  fetch?: typeof fetch | undefined
  signal?: AbortSignal | undefined
}): AppAuth | undefined => {
  const storage = appStorage(options.env, options.profile, options.keyring)
  const stored = storage.read() as
    | (ReturnType<TokenStorage["read"]> & { redirectUri?: string; browser?: boolean })
    | undefined
  if (!stored) return undefined
  if (!stored.account || !stored.client)
    throw new CliError("authentication_error", "the saved amoCRM sign-in cannot be read; sign in again", {
      reason: "oauth.invalid",
    })
  const origin = accountOrigin(stored.account.host)
  const keeper = tokenKeeper({
    provider: appProvider(origin, stored.client, stored.redirectUri),
    storage,
    lockDir: paths(options.env).config,
    fetch: fetchFor(origin, options.fetch),
    signInCommand: `${IDENTITY.command} ${options.profile} session start --host ${origin} ${
      stored.browser ? "--one-click" : `--client-id ${stored.client.clientId}`
    }`,
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return { origin, userId: stored.account.userId, accessToken: (refresh) => keeper.accessToken({ refresh }) }
}
