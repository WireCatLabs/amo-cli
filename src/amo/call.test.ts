import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliError } from "@wirecat/cli-base"
import { Pacer } from "@wirecat/cli-core/sends"
import { describe, expect, it } from "vitest"
import { providerCall } from "./call.js"

/** A real file-backed pace on a clock the test owns, with every wait recorded instead of slept. */
const paced = () => {
  let clock = 1_000_000
  const slept: number[] = []
  const now = () => clock
  const sleep = async (ms: number) => {
    slept.push(ms)
    clock += ms
  }
  const pacer = new Pacer(
    join(mkdtempSync(join(tmpdir(), "amo-pace-")), "pace.json"),
    { perMinute: 300, burst: 1 },
    now,
  )
  return { slept, sleep, pace: { pacer, name: "amoCRM", operation: "test", now, sleep } }
}

const failing = (errors: CliError[], answer = "done") => {
  let sent = 0
  return {
    sent: () => sent,
    send: async () => {
      const error = errors[sent++]
      if (error) throw error
      return answer
    },
  }
}

const rate = (ms: number) => new CliError("rate_limited", "slow down", { retry_after_ms: ms, retryable: true })
const lost = () => new CliError("network_error", "no answer", { retryable: true })

describe("providerCall", () => {
  it("tries a read again on a lost answer and on a refused rate, waiting the asked time", async () => {
    const { pace, sleep, slept } = paced()
    const call = failing([lost(), rate(2_000)])
    expect(await providerCall({ write: false, send: call.send, pace, sleep, random: () => 0 })).toBe("done")
    expect(call.sent()).toBe(3)
    expect(slept).toContain(2_000)
  })

  it("waits between attempts even without a pace (FIND-17)", async () => {
    const slept: number[] = []
    const call = failing([lost(), lost()])
    const sleep = async (ms: number) => {
      slept.push(ms)
    }
    expect(await providerCall({ write: false, send: call.send, sleep, random: () => 0.5 })).toBe("done")
    expect(slept).toHaveLength(2)
    expect(slept.every((ms) => ms > 0)).toBe(true)
  })

  it("tries a write again only on a refused rate, which amoCRM answers before doing anything", async () => {
    const { pace, sleep } = paced()
    const call = failing([rate(1_000)])
    expect(await providerCall({ write: true, send: call.send, pace, sleep })).toBe("done")
    expect(call.sent()).toBe(2)
  })

  it("turns a write's lost answer into outcome_unknown and never sends it again", async () => {
    const call = failing([lost()])
    await expect(providerCall({ write: true, send: call.send })).rejects.toMatchObject({
      code: "outcome_unknown",
      details: { retryable: false },
    })
    expect(call.sent()).toBe(1)
  })

  it("hands a wait longer than 30 s back with retry_after_ms instead of sitting in it", async () => {
    const call = failing([rate(300_000)])
    await expect(providerCall({ write: false, send: call.send })).rejects.toMatchObject({
      code: "rate_limited",
      details: { retry_after_ms: 300_000 },
    })
    expect(call.sent()).toBe(1)
  })

  it("stops after its retries", async () => {
    const call = failing([lost(), lost(), lost()])
    await expect(
      providerCall({ write: false, send: call.send, retries: 2, sleep: async () => {} }),
    ).rejects.toMatchObject({
      code: "network_error",
    })
    expect(call.sent()).toBe(3)
  })

  it("refreshes an expired OAuth token once, and gives up when the refresh does", async () => {
    const expired = () => new CliError("authentication_error", "expired", { reason: "oauth.expired" })
    const again = failing([expired()])
    expect(await providerCall({ write: true, send: again.send, refresh: async () => true })).toBe("done")
    const twice = failing([expired(), expired()])
    await expect(providerCall({ write: false, send: twice.send, refresh: async () => true })).rejects.toMatchObject({
      details: { reason: "oauth.expired" },
    })
    const refused = failing([expired()])
    await expect(providerCall({ write: false, send: refused.send, refresh: async () => false })).rejects.toMatchObject({
      details: { reason: "oauth.expired" },
    })
  })

  it("never refreshes a refused long-lived token: it stays session.expired", async () => {
    let refreshes = 0
    const call = failing([new CliError("authentication_error", "refused", { reason: "session.expired" })])
    const refresh = async () => {
      refreshes++
      return true
    }
    await expect(providerCall({ write: false, send: call.send, refresh })).rejects.toMatchObject({
      details: { reason: "session.expired" },
    })
    expect(refreshes).toBe(0)
  })

  it("passes on what is not a CliError untouched", async () => {
    await expect(
      providerCall({
        write: false,
        send: async () => {
          throw new TypeError("bug")
        },
      }),
    ).rejects.toBeInstanceOf(TypeError)
  })
})
