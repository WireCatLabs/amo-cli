import { randomBytes } from "node:crypto"
import { createServer, type RequestListener } from "node:http"
import { CliError, isCliError, type KeyringStore, type SleepLike } from "@wirecat/cli-base"
import { hostFetch } from "@wirecat/cli-base/http"
import { type OAuthClient, tokenKeeper } from "@wirecat/cli-core/oauth"
import { IDENTITY } from "../identity.js"
import { isRecord } from "./json.js"
import {
  type AppAuth,
  appProvider,
  appStorage,
  BUTTON_RELAY_URL,
  CLAIM_URL,
  CONNECT_PAGE_URL,
  fetchFor,
  lockDirOf,
} from "./oauth.js"

export const CONNECT_VARIABLE = `${IDENTITY.envPrefix}_CONNECT_URL`
/** The claim server keeps the integration's keys 10 minutes; a wait longer than that could never be claimed. */
const CALLBACK_MS = 600_000
/** amoCRM posts the keys before it redirects (oauth/button), so a minute covers a slow webhook. */
const CLAIM_MS = 60_000
const CLAIM_PAUSES_MS = [500, 1000, 2000, 4000]
const REQUEST_MS = 30_000
const AMOCRM_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.amocrm\.ru$/

/** The button page and the claim endpoint; a test moves both to one fake origin, keeping their paths. */
export const connectUrls = (env: NodeJS.ProcessEnv): { page: string; claim: string } => {
  const given = env[CONNECT_VARIABLE]?.trim()
  if (!given) return { page: CONNECT_PAGE_URL, claim: CLAIM_URL }
  let url: URL | undefined
  try {
    url = new URL(given)
  } catch {
    url = undefined
  }
  if (url?.protocol !== "https:" || url.username || url.password)
    throw new CliError(
      "configuration_error",
      `${CONNECT_VARIABLE} must be an https address, such as https://connect.wirecat.dev`,
      {
        reason: "connect.url-invalid",
      },
    )
  const { origin } = url
  const moved = (address: string) => `${origin}${new URL(address).pathname}`
  return { page: moved(CONNECT_PAGE_URL), claim: moved(CLAIM_URL) }
}

/** Kommo's button is not checked yet, so a guess could create an integration amo then cannot finish. */
export const refuseKommo = (origin: string) => {
  if (AMOCRM_HOST.test(new URL(origin).hostname)) return
  throw new CliError(
    "validation_error",
    "the browser sign-in works only for amoCRM accounts at amocrm.ru for now; sign in to Kommo with a long-lived " +
      "token or --client-id",
    { reason: "oauth.browser-amocrm-only", param: "--host" },
  )
}

const queryOf = (text: string) => {
  const trimmed = text.trim()
  const start = trimmed.indexOf("?")
  return new URLSearchParams(start >= 0 ? trimmed.slice(start + 1).split("#")[0] : trimmed)
}

export interface BrowserSteps {
  openBrowser: (url: string) => Promise<void>
  showUrl: (url: string) => void
  readPaste?: (signal: AbortSignal) => Promise<string>
}

/**
 * The local port the relay page sends amoCRM's redirect to. cli-core's `authorize` cannot serve here: it needs the
 * integration before the browser opens, puts `state` in the query and answers only the code, not amoCRM's `referer`.
 */
const awaitRedirect = async (
  open: (state: string) => string,
  steps: BrowserSteps,
  signal: AbortSignal | undefined,
): Promise<{ state: string; query: URLSearchParams }> => {
  if (signal?.aborted) throw new CliError("cancelled", "the amoCRM sign-in was cancelled")
  const paste = new AbortController()
  let state = ""
  let settled = false
  let accept: (query: URLSearchParams) => void = () => {}
  let fail: (error: Error) => void = () => {}
  const redirect = new Promise<URLSearchParams>((resolve, reject) => {
    accept = (query) => {
      settled = true
      resolve(query)
    }
    fail = (error) => {
      settled = true
      reject(error)
    }
  })
  void redirect.catch(() => {})
  const handler: RequestListener = (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (request.method !== "GET" || url.pathname !== "/callback") return void response.writeHead(404).end()
    if (settled || !state || url.searchParams.get("state") !== state)
      return void response.writeHead(400).end("This sign-in link does not belong to the waiting sign-in")
    response.end("Sign-in received; you can close this tab")
    accept(url.searchParams)
  }
  const server = createServer(handler)
  const onAbort = () => fail(new CliError("cancelled", "the amoCRM sign-in was cancelled"))
  signal?.addEventListener("abort", onAbort, { once: true })
  const timer = setTimeout(
    () => fail(new CliError("timeout", "the amoCRM sign-in timed out", { reason: "oauth.timeout" })),
    CALLBACK_MS,
  )
  timer.unref()
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (!address || typeof address === "string")
      throw new CliError("configuration_error", "could not start the local sign-in listener")
    // The relay page reads the port from the front of `state` (cli-docs amo-callback.html).
    state = `${address.port}.${randomBytes(32).toString("base64url")}`
    const url = open(state)
    steps.showUrl(url)
    steps
      .readPaste?.(paste.signal)
      .then((text) => {
        if (settled) return
        const query = queryOf(text)
        if (query.get("state") !== state)
          fail(
            new CliError("authentication_error", "the pasted sign-in result does not match this sign-in", {
              reason: "oauth.mismatch",
            }),
          )
        else accept(query)
      })
      .catch(() => {})
    void Promise.resolve()
      .then(() => steps.openBrowser(url))
      .catch(() => {})
    return { state, query: await redirect }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
    paste.abort()
    server.closeAllConnections()
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

/** amoCRM names the account the person allowed access in; the code and the keys belong to that one. */
const refuseOtherAccount = (origin: string, query: URLSearchParams) => {
  const given = (query.get("referer") ?? "").trim().toLowerCase()
  const host = given.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const expected = new URL(origin).hostname
  if (host === expected) return
  const named = AMOCRM_HOST.test(host) ? host : undefined
  throw new CliError(
    "authentication_error",
    named
      ? `access was allowed in ${named}, not in ${expected}; run this again with --host https://${named}, or choose ` +
          `${expected} in amoCRM's window`
      : `amoCRM did not say which account access was allowed in, so nothing was sent to ${expected}; run this again`,
    { reason: "oauth.mismatch", ...(named ? { account: named } : {}) },
  )
}

interface ClaimOptions {
  claim: string
  state: string
  fetch?: typeof fetch | undefined
  sleep: SleepLike
  now: () => number
  signal?: AbortSignal | undefined
}

/**
 * The keys amoCRM posted to the claim server for this `state`, read once. A 404 `not_ready` means the webhook has not come
 * yet. No failure quotes the answer: a body may hold the secret.
 */
export const claimKeys = async (options: ClaimOptions): Promise<OAuthClient> => {
  const host = new URL(options.claim).hostname
  const request = hostFetch({
    hosts: [host],
    timeoutMs: REQUEST_MS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  const again = "start the browser sign-in again"
  const deadline = options.now() + CLAIM_MS
  for (let attempt = 0; ; attempt += 1) {
    let response: Response
    try {
      response = await request(options.claim, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ state: options.state }),
        redirect: "error",
        ...(options.signal ? { signal: options.signal } : {}),
      })
    } catch (error) {
      if (options.signal?.aborted) throw new CliError("cancelled", "the amoCRM sign-in was cancelled")
      if (isCliError(error)) throw error
      throw new CliError("provider_unavailable", `could not reach ${host} for the integration's keys; ${again}`, {
        retryable: true,
        reason: "oauth.unavailable",
      })
    }
    const answer: unknown = await response.json().catch(() => undefined)
    if (response.ok) {
      const id = isRecord(answer) ? answer.client_id : undefined
      const secret = isRecord(answer) ? answer.client_secret : undefined
      if (typeof id !== "string" || !id || typeof secret !== "string" || !secret)
        throw new CliError("invalid_response", `${host} returned keys amo cannot use; ${again}`, {
          reason: "oauth.invalid-response",
        })
      return { clientId: id, clientSecret: secret }
    }
    const notReady = response.status === 404 && isRecord(answer) && answer.error === "not_ready"
    if (!notReady)
      throw new CliError(
        "provider_unavailable",
        `${host} did not hand over the integration's keys (HTTP ${response.status}); ${again}`,
        { status: response.status, reason: "oauth.unavailable" },
      )
    if (options.now() >= deadline)
      throw new CliError("timeout", `amoCRM did not send the integration's keys to ${host} within a minute; ${again}`, {
        reason: "oauth.timeout",
      })
    await options.sleep(CLAIM_PAUSES_MS[Math.min(attempt, CLAIM_PAUSES_MS.length - 1)] ?? 4000, options.signal, "retry")
  }
}

export interface BrowserSignInOptions<T> {
  env: NodeJS.ProcessEnv
  profile: string
  origin: string
  storage: "keyring" | "file"
  keyring?: KeyringStore | undefined
  fetch?: typeof fetch | undefined
  sleep: SleepLike
  now: () => number
  signal?: AbortSignal | undefined
  steps: BrowserSteps
  /** Whose rights the new tokens carry, asked of the account before anything is kept. */
  check: (auth: AppAuth) => Promise<T>
}

/**
 * amoCRM's button on the connect page creates an integration in the account the person picks and posts its keys to
 * the claim server; amo claims them once, exchanges the code on the account `--host` names and keeps it all as a
 * `--client-id` sign-in, marked so a failed renewal names this command.
 */
export const browserSignIn = async <T extends { id: string }>(options: BrowserSignInOptions<T>): Promise<T> => {
  const { origin } = options
  refuseKommo(origin)
  const connect = connectUrls(options.env)
  const storage = appStorage(
    options.env,
    options.profile,
    options.keyring,
    options.storage === "file" ? "file" : "auto",
  )
  storage.probe()
  const { state, query } = await awaitRedirect((made) => `${connect.page}#state=${made}`, options.steps, options.signal)
  if (!query.get("code"))
    throw new CliError("authentication_error", "amoCRM sign-in was declined", { reason: "oauth.declined" })
  refuseOtherAccount(origin, query)
  const client = await claimKeys({
    claim: connect.claim,
    state,
    fetch: options.fetch,
    sleep: options.sleep,
    now: options.now,
    signal: options.signal,
  })
  const signInCommand = `${IDENTITY.command} ${options.profile} session start --host ${origin} --one-click`
  const provider = appProvider(origin, client, BUTTON_RELAY_URL)
  const fetch = fetchFor(origin, options.fetch)
  const tokens = await provider.exchange?.(
    { grant_type: "authorization_code", code: query.get("code") ?? "" },
    { fetch, client, now: Date.now, signInCommand, ...(options.signal ? { signal: options.signal } : {}) },
  )
  if (!tokens) throw new CliError("authentication_error", "amoCRM did not answer the sign-in")
  const access = tokens.accessToken ?? ""
  const user = await options.check({ origin, userId: "", accessToken: async () => access })
  // The keeper keeps a saved entry's own client over a new one, and this sign-in brings a new integration.
  storage.remove()
  await tokenKeeper({ provider, storage, lockDir: lockDirOf(options.env), fetch, signInCommand }).save(tokens, {
    host: origin,
    userId: user.id,
    redirectUri: BUTTON_RELAY_URL,
    browser: true,
  })
  return user
}
