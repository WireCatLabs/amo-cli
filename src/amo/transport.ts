import { CliError, isCliError, realSleep, type SleepLike } from "@wirecat/cli-base"
import { type FetchLike, hostFetch, providerWaitMs, readJsonResponse } from "@wirecat/cli-base/http"
import { apiJson, currentAttempt, type EventSink, providerEvent, providerRequest } from "@wirecat/cli-core/cli"
import { providerCall } from "@wirecat/cli-core/crm"
import type { Pacer, TurnOptions } from "@wirecat/cli-core/sends"
import { type EmployeeRule, employeeRuleOf } from "../api-keys.js"
import type { AmoSignIn } from "./account.js"
import { amoError, isBlock } from "./errors.js"
import { isRecord } from "./json.js"
import type { AppAuth } from "./oauth.js"
import { type Matched, matchOperation, pathOf } from "./operation.js"
import { ROUTES, type Route } from "./routes.js"

/** A third of a one-shot command's 30 s deadline, so a read that timed out can be tried again before the run ends. */
const DEFAULT_TIMEOUT_MS = 10_000
const LARGEST_ANSWER = 16 * 1024 * 1024
/**
 * Below the one-shot run's 30 s deadline, and below what is left of the run's own deadline less a second for the
 * request: a longer pace ends as `rate_limited` with its wait, not as the deadline.
 */
const LONGEST_PACE_WAIT_MS = 20_000
const REQUEST_MARGIN_MS = 1_000
/** A block stops every request from here: every amo process on the account holds off this long (Kommo http-codes). */
const BLOCK_HOLD_MS = 60_000

export type QueryValue = string | number | boolean | readonly (string | number)[]

export interface AmoRequest {
  /** One of amo's own routes, or the operation `api call` matched. */
  route: Route | Matched
  ids?: Record<string, string | number>
  query?: Readonly<Record<string, QueryValue | undefined>>
  body?: unknown
}

export interface AmoAnswer {
  status: number
  /** `undefined` on 204, amoCRM's answer to an empty list. */
  body: unknown
}

/** A long-lived token, or the owner's integration, whose access token is renewed by its refresh token. */
export type AmoAuth = AmoSignIn | AppAuth

const isApp = (auth: AmoAuth): auth is AppAuth => "accessToken" in auth

export interface AmoTransportOptions {
  signIn: AmoAuth
  fetch?: FetchLike
  timeoutMs?: number
  signal?: AbortSignal | undefined
  events?: EventSink
  /** Shared by every `amo` process on the account, whatever the profile: amoCRM limits per integration and account. */
  pacer?: Pacer
  sleep?: SleepLike
  now?: () => number
  warn?: TurnOptions["warn"]
  /** The run's deadline now, as cli-core's `run()` sets it; none for a persistent command. */
  deadline?: () => { endsAt: number } | undefined
}

const isTimeout = (error: unknown) => error instanceof Error && error.name === "TimeoutError"

const routeOf = (request: AmoRequest): Matched => {
  const matched = typeof request.route === "string" ? matchOperation(request.route) : request.route
  const ids = Object.fromEntries(Object.entries(request.ids ?? {}).map(([key, value]) => [key, String(value)]))
  for (const [key, value] of Object.entries(ids))
    if (!(key in matched.operation.path) || value === "" || value === "." || value === "..")
      throw new CliError("validation_error", `${matched.operation.name} takes no id ${key}="${value}"`)
  return { operation: matched.operation, ids: { ...matched.ids, ...ids } }
}

const EMPLOYEE_REFUSALS: Record<EmployeeRule, string> = {
  delete: "deletes",
  clear: "sets a field to nothing",
  unbind: "unlinks records",
}

/**
 * amoCRM's API v4 on one account, operation by operation.
 *
 * ⚠ **The token is in the Authorization header only**: never in an address, an error or a run record, and a failed
 * request's own error, whose text may hold the request, is never passed on (tg-cli's Bot API transport, b24's).
 */
export class AmoTransport {
  readonly #signIn: AmoAuth
  readonly #fetch: FetchLike
  readonly #timeoutMs: number
  readonly #signal: AbortSignal | undefined
  readonly #events: EventSink | undefined
  readonly #pacer: Pacer | undefined
  readonly #sleep: SleepLike
  readonly #now: () => number
  readonly #warn: TurnOptions["warn"]
  readonly #deadline: AmoTransportOptions["deadline"]
  #admin: Promise<boolean> | undefined

  constructor(options: AmoTransportOptions) {
    this.#signIn = options.signIn
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    // The account is the one host amo reaches (identity `userHosts`); our own deadline below fires first.
    this.#fetch = hostFetch({
      hosts: [new URL(options.signIn.origin).hostname],
      ...(options.fetch ? { fetch: options.fetch } : {}),
      timeoutMs: this.#timeoutMs * 2,
    })
    this.#signal = options.signal
    this.#events = options.events
    this.#pacer = options.pacer
    this.#sleep = options.sleep ?? realSleep
    this.#now = options.now ?? Date.now
    this.#warn = options.warn
    this.#deadline = options.deadline
  }

  #longestWaitMs(): number {
    const ends = this.#deadline?.()?.endsAt
    return ends === undefined
      ? LONGEST_PACE_WAIT_MS
      : Math.max(0, Math.min(LONGEST_PACE_WAIT_MS, ends - this.#now() - REQUEST_MARGIN_MS))
  }

  /** The account's address, which holds no secret. */
  get origin(): string {
    return this.#signIn.origin
  }

  /**
   * One operation, paced, a read tried again on a lost answer, any call on a refused rate (`providerCall`). A write
   * only an administrator may send is refused here, where every write passes (NEED-2669 A).
   */
  async request(request: AmoRequest): Promise<AmoAnswer> {
    const route = routeOf(request)
    const { operation } = route
    const write = operation.effect !== "read"
    if (write) await this.#refuseForEmployee(route, request.body)
    let attempt = 0
    return providerCall({
      write,
      sleep: (ms) => this.#wait(ms),
      ...(this.#pacer
        ? {
            pace: {
              pacer: this.#pacer,
              name: "amoCRM",
              operation: operation.name,
              now: this.#now,
              sleep: (ms: number) => this.#wait(ms),
              longestWaitMs: this.#longestWaitMs(),
              ...(this.#warn ? { warn: this.#warn } : {}),
            },
          }
        : {}),
      ...(isApp(this.#signIn) ? { refresh: () => this.#refresh() } : {}),
      send: () => this.#once(route, request, write, ++attempt),
    })
  }

  /**
   * Whether the token's user is the account's administrator: `rights.is_admin` of `/api/v4/users/{id}`, which only an
   * administrator may read, so a refusal is a no (users-api). Asked once per run, and only when a rule needs it.
   */
  isAdmin(): Promise<boolean> {
    this.#admin ??= (async () => {
      let id = this.#signIn.userId
      if (id === undefined) {
        const { body } = await this.request({ route: ROUTES.account })
        id = isRecord(body) ? String(body.current_user_id ?? "") : ""
      }
      try {
        const { body } = await this.request({ route: ROUTES.user, ids: { id } })
        return isRecord(body) && isRecord(body.rights) && body.rights.is_admin === true
      } catch (error) {
        if (isCliError(error) && error.details.reason === "amo.access-denied") return false
        throw error
      }
    })()
    return this.#admin
  }

  /** The access token amoCRM refused is renewed once; the keeper saves the rotated refresh token under its lock. */
  async #refresh(): Promise<boolean> {
    const auth = this.#signIn
    if (!isApp(auth)) return false
    await auth.accessToken(true)
    return true
  }

  async #refuseForEmployee(route: Matched, body: unknown) {
    const rule = employeeRuleOf(route.operation, body)
    if (rule === undefined || (await this.isAdmin())) return
    throw new CliError(
      "permission_error",
      `${route.operation.name} ${EMPLOYEE_REFUSALS[rule]}, which amo lets only an amoCRM administrator do, whatever ` +
        "the permissions say. Sign in with an administrator's token (session start) to do it",
      { reason: `employee.${rule}`, operation: route.operation.name, sent: false },
    )
  }

  async #wait(ms: number) {
    try {
      await this.#sleep(ms, this.#signal, "retry")
    } catch {
      throw new CliError("cancelled", "stopped while waiting for amoCRM")
    }
  }

  async #once(route: Matched, request: AmoRequest, write: boolean, attempt: number): Promise<AmoAnswer> {
    const { operation } = route
    // Not AbortSignal.timeout: its timer holds the run's async context until the deadline (tg-cli, 2026-11-05).
    const deadline = new AbortController()
    const timer = setTimeout(
      () => deadline.abort(new DOMException(`${operation.name} timed out`, "TimeoutError")),
      this.#timeoutMs,
    )
    timer.unref()
    const end = providerRequest(operation.name, this.#events ?? providerEvent, {
      method: operation.method,
      endpointTemplate: operation.template,
      transport: "http",
      ...(currentAttempt() ? {} : { attempt }),
    })
    const signal = AbortSignal.any([deadline.signal, ...(this.#signal ? [this.#signal] : [])])
    try {
      const response = await this.#send(route, request, write, signal, end)
      if (response.status === 204) {
        end({ status: 204 })
        return { status: 204, body: undefined }
      }
      const { body, json } = await this.#read(operation.name, response, write, signal, end)
      if (!response.ok) throw await this.#refusal(operation.name, response, body, json, write, end)
      end({ status: response.status })
      return { status: response.status, body }
    } finally {
      clearTimeout(timer)
    }
  }

  async #send(
    route: Matched,
    request: AmoRequest,
    write: boolean,
    signal: AbortSignal,
    end: ReturnType<typeof providerRequest>,
  ): Promise<Response> {
    const { operation } = route
    const url = new URL(pathOf(route), this.#signIn.origin)
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value === undefined) continue
      for (const one of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(one))
    }
    const auth = this.#signIn
    const token = isApp(auth) ? await auth.accessToken(false) : auth.token
    try {
      return await this.#fetch(url, {
        method: operation.method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/hal+json, application/problem+json, application/json",
          ...(request.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(request.body === undefined ? {} : { body: apiJson(request.body) }),
        // A redirect would carry the Authorization header to an address we did not choose.
        redirect: "error",
        signal,
      })
    } catch (error) {
      const failure = this.#unanswered(operation.name, write, signal.aborted ? signal.reason : error)
      end({ errorCode: failure.code })
      throw failure
    }
  }

  async #read(
    operation: string,
    response: Response,
    write: boolean,
    signal: AbortSignal,
    end: ReturnType<typeof providerRequest>,
  ): Promise<{ body: unknown; json: boolean }> {
    try {
      return { body: await readJsonResponse(response, { maxBytes: LARGEST_ANSWER, signal }), json: true }
    } catch (error) {
      if (signal.aborted) {
        const failure = this.#unanswered(operation, write, signal.reason)
        end({ status: response.status, errorCode: failure.code })
        throw failure
      }
      if (!response.ok) return { body: undefined, json: false }
      end({ status: response.status, errorCode: "invalid_response" })
      throw new CliError("invalid_response", `amoCRM answered ${operation} with something that is not JSON`, {
        operation,
        status: response.status,
        ...(isCliError(error) ? { reason: error.details.reason } : {}),
      })
    }
  }

  async #refusal(
    operation: string,
    response: Response,
    body: unknown,
    json: boolean,
    write: boolean,
    end: ReturnType<typeof providerRequest>,
  ): Promise<CliError> {
    const confirmed =
      response.status === 403 && !json && operation !== ROUTES.account && isBlock(operation, body, json)
        ? await this.#blockConfirmed()
        : true
    const refusal = amoError(operation, response.status, body, {
      json: !confirmed || json,
      waitMs: providerWaitMs(response.headers, () => new Date(this.#now())),
      ...(isApp(this.#signIn) ? { oauth: true } : {}),
    })
    end({ status: response.status, errorCode: refusal.code })
    if (refusal.details.reason === "amo.blocked") await this.#pacer?.holdFor(BLOCK_HOLD_MS)
    if (!write || refusal.code !== "provider_unavailable") return refusal
    return new CliError("outcome_unknown", `amoCRM failed on ${operation}; it may or may not have carried it out`, {
      ...refusal.details,
      retryable: false,
    })
  }

  /**
   * A bare 403 is a block only if the account itself, which no right gates, is refused too: no page shows how a
   * rights refusal of another route looks, and a non-administrator's `users/{id}` may be one (RR-3).
   */
  async #blockConfirmed(): Promise<boolean> {
    try {
      await this.request({ route: ROUTES.account })
      return false
    } catch (error) {
      if (isCliError(error) && error.details.reason === "amo.blocked") return true
      throw error
    }
  }

  /** A cut write may have reached amoCRM: never `cancelled`, which a caller would repeat; `providerCall` says so. */
  #unanswered(operation: string, write: boolean, error: unknown): CliError {
    if (!write && this.#signal?.aborted && !isTimeout(this.#signal.reason))
      return new CliError("cancelled", `${operation} was cancelled`, { operation })
    const timedOut = isTimeout(error)
    return new CliError(
      timedOut ? "timeout" : "network_error",
      timedOut ? `${operation} got no answer within ${this.#timeoutMs} ms` : `${operation} could not reach amoCRM`,
      { operation, retryable: true },
    )
  }
}
