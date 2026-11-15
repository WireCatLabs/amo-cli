import { CliError, isCliError, realSleep, type SleepLike, wallClock } from "@wirecat/cli-base"
import { type FetchLike, hostFetch, providerWaitMs, readJsonResponse } from "@wirecat/cli-base/http"
import { apiJson, currentAttempt, type EventSink, providerEvent, providerRequest } from "@wirecat/cli-core/cli"
import { type Pacer, waitForTurn } from "@wirecat/cli-core/sends"
import type { AmoSignIn } from "./account.js"
import { type CallPacer, providerCall } from "./call.js"
import { amoError } from "./errors.js"
import { type Matched, matchOperation, pathOf } from "./operation.js"

/** A third of a one-shot command's 30 s deadline, so a read that timed out can be tried again before the run ends. */
const DEFAULT_TIMEOUT_MS = 10_000
const LARGEST_ANSWER = 16 * 1024 * 1024
/** An agent usually waits on amo: past a minute the run ends with retry_after_ms instead of sitting silent. */
const LONGEST_PACE_WAIT_MS = 60_000

export type QueryValue = string | number | boolean | readonly (string | number)[]

export interface AmoRequest {
  /** `GET /api/v4/leads/{id}`, a name the spec or the allow-list has. */
  route: string
  ids?: Record<string, string | number>
  query?: Readonly<Record<string, QueryValue | undefined>>
  body?: unknown
}

export interface AmoAnswer {
  status: number
  /** `undefined` on 204, amoCRM's answer to an empty list. */
  body: unknown
}

export interface AmoTransportOptions {
  signIn: AmoSignIn
  fetch?: FetchLike
  timeoutMs?: number
  signal?: AbortSignal | undefined
  events?: EventSink
  /** Shared by every `amo` process on the account, whatever the profile: amoCRM limits per integration and account. */
  pacer?: Pacer
  sleep?: SleepLike
  now?: () => number
}

const isTimeout = (error: unknown) => error instanceof Error && error.name === "TimeoutError"

const routeOf = (request: AmoRequest): Matched => {
  const matched = matchOperation(request.route)
  const ids = Object.fromEntries(Object.entries(request.ids ?? {}).map(([key, value]) => [key, String(value)]))
  for (const [key, value] of Object.entries(ids))
    if (!(key in matched.operation.path) || value === "" || value === "." || value === "..")
      throw new CliError("validation_error", `${request.route} takes no id ${key}="${value}"`)
  return { operation: matched.operation, ids: { ...matched.ids, ...ids } }
}

/**
 * amoCRM's API v4 on one account, operation by operation.
 *
 * ⚠ **The token is in the Authorization header only**: never in an address, an error or a run record, and a failed
 * request's own error, whose text may hold the request, is never passed on (tg-cli's Bot API transport, b24's).
 */
export class AmoTransport {
  readonly #signIn: AmoSignIn
  readonly #fetch: FetchLike
  readonly #timeoutMs: number
  readonly #signal: AbortSignal | undefined
  readonly #events: EventSink | undefined
  readonly #pacer: CallPacer | undefined

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
    const sleep = options.sleep ?? realSleep
    const now = options.now ?? Date.now
    const pacer = options.pacer
    if (pacer) {
      let held: Promise<void> = Promise.resolve()
      this.#pacer = {
        holdFor: (ms) => {
          held = pacer.holdFor(ms)
        },
        wait: async () => {
          await held
          await waitForTurn(pacer, {
            name: "amoCRM",
            operation: "request",
            now,
            sleep: async (ms) => {
              try {
                await sleep(ms, this.#signal, "retry")
              } catch {
                throw new CliError("cancelled", "stopped while waiting for amoCRM's pace")
              }
            },
            longestWaitMs: LONGEST_PACE_WAIT_MS,
          })
        },
      }
    }
  }

  /** The account's address, which holds no secret. */
  get origin(): string {
    return this.#signIn.origin
  }

  get userId(): string | undefined {
    return this.#signIn.userId
  }

  /** One operation, paced, a read tried again on a lost answer, any call on a refused rate (`providerCall`). */
  async request(request: AmoRequest): Promise<AmoAnswer> {
    const route = routeOf(request)
    const write = route.operation.effect !== "read"
    let attempt = 0
    return providerCall({
      write,
      ...(this.#pacer ? { pacer: this.#pacer } : {}),
      send: () => this.#once(route, request, write, ++attempt),
    })
  }

  async #once(route: Matched, request: AmoRequest, write: boolean, attempt: number): Promise<AmoAnswer> {
    const { operation } = route
    const url = new URL(pathOf(route), this.#signIn.origin)
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value === undefined) continue
      for (const one of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(one))
    }
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
      let response: Response
      try {
        response = await this.#fetch(url, {
          method: operation.method,
          headers: {
            authorization: `Bearer ${this.#signIn.token}`,
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
      if (response.status === 204) {
        end({ status: 204 })
        return { status: 204, body: undefined }
      }
      let body: unknown
      let json = true
      try {
        body = await readJsonResponse(response, { maxBytes: LARGEST_ANSWER, signal })
      } catch (error) {
        if (signal.aborted) {
          const failure = this.#unanswered(operation.name, write, signal.reason)
          end({ status: response.status, errorCode: failure.code })
          throw failure
        }
        if (response.ok) {
          end({ status: response.status, errorCode: "invalid_response" })
          throw new CliError("invalid_response", `amoCRM answered ${operation.name} with something that is not JSON`, {
            operation: operation.name,
            status: response.status,
            ...(isCliError(error) ? { reason: error.details.reason } : {}),
          })
        }
        json = false
      }
      if (!response.ok) {
        const refusal = amoError(operation.name, response.status, body, {
          json,
          waitMs: providerWaitMs(response.headers, wallClock),
        })
        end({ status: response.status, errorCode: refusal.code })
        throw write && refusal.code === "provider_unavailable"
          ? new CliError(
              "outcome_unknown",
              `amoCRM failed on ${operation.name}; it may or may not have carried it out`,
              {
                ...refusal.details,
                retryable: false,
              },
            )
          : refusal
      }
      end({ status: response.status })
      return { status: response.status, body }
    } finally {
      clearTimeout(timer)
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

/** The records of a HAL list, `_embedded.<name>`; none on 204. */
export const embedded = (answer: AmoAnswer, name: string): unknown[] => {
  const holder = (answer.body as { _embedded?: Record<string, unknown> } | undefined)?._embedded
  const list = holder?.[name]
  return Array.isArray(list) ? list : []
}
