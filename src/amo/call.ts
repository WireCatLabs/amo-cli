import { backoffMs, CliError, isCliError, type RetryConfig } from "@wirecat/cli-base"

/*
 * A local copy of the shape cli-core's `providerCall` (@wirecat/cli-core/crm) is frozen at in the amo-cli plan, so
 * the transport codes against it now; phase 4 deletes this file and imports cli-core's.
 */

export interface CallPacer {
  holdFor(ms: number): void
  wait(): Promise<void>
}

export interface ProviderCallOptions<T> {
  write: boolean
  /** One HTTP exchange; throws a CliError with a reason. */
  send: () => Promise<T>
  pacer?: CallPacer
  /** One token refresh on `session.expired`; false gives up. */
  refresh?: () => Promise<boolean>
  /** Reads: a retryable failure and `rate_limited`; writes: `rate_limited` only. */
  retries?: number
}

const RETRY: RetryConfig = { retries: 3, baseDelayMs: 1_000, maxDelayMs: 10_000, maxRetryAfterMs: 30_000 }

const lost = (error: CliError) => error.code === "network_error" || error.code === "timeout"

/**
 * Paces every attempt, tries a read again on a retryable failure and any call on `rate_limited`, which the provider
 * answers before doing anything. A wait longer than 30 s is the caller's: the error carries `retry_after_ms`. A write
 * that got no answer may have landed, so it is `outcome_unknown` and never sent again (WC-LIFE-9).
 */
export const providerCall = async <T>({
  write,
  send,
  pacer,
  refresh,
  retries = RETRY.retries,
}: ProviderCallOptions<T>): Promise<T> => {
  let refreshed = false
  for (let attempt = 1; ; attempt++) {
    await pacer?.wait()
    try {
      return await send()
    } catch (error) {
      if (!isCliError(error)) throw error
      if (write && lost(error))
        throw new CliError("outcome_unknown", `${error.message}; the write may or may not have been carried out`, {
          ...error.details,
          retryable: false,
        })
      if (error.details.reason === "session.expired" && refresh && !refreshed) {
        refreshed = true
        if (await refresh()) continue
        throw error
      }
      const again = error.code === "rate_limited" || (!write && error.details.retryable === true)
      const asked = error.details.retry_after_ms
      const wait = typeof asked === "number" ? asked : backoffMs(attempt, RETRY, Math.random)
      if (!again || attempt > retries || wait > RETRY.maxRetryAfterMs) throw error
      // The shape has no sleep of its own: the pace holds every caller on the account, which a refusal asks for.
      pacer?.holdFor(wait)
    }
  }
}
