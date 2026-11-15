import { CliError } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { providerCall } from "./call.js"

const pacer = () => {
  const held: number[] = []
  let waits = 0
  return {
    held,
    waits: () => waits,
    holdFor: (ms: number) => {
      held.push(ms)
    },
    wait: async () => {
      waits++
    },
  }
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
  it("tries a read again on a lost answer and on a refused rate, holding the pace for the asked wait", async () => {
    const pace = pacer()
    const call = failing([lost(), rate(2_000)])
    expect(await providerCall({ write: false, send: call.send, pacer: pace })).toBe("done")
    expect(call.sent()).toBe(3)
    expect(pace.waits()).toBe(3)
    expect(pace.held[1]).toBe(2_000)
  })

  it("tries a write again only on a refused rate, which amoCRM answers before doing anything", async () => {
    const call = failing([rate(1_000)])
    expect(await providerCall({ write: true, send: call.send, pacer: pacer() })).toBe("done")
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
    await expect(providerCall({ write: false, send: call.send, retries: 2 })).rejects.toMatchObject({
      code: "network_error",
    })
    expect(call.sent()).toBe(3)
  })

  it("refreshes a refused token once, and gives up when the refresh does", async () => {
    const expired = () => new CliError("authentication_error", "expired", { reason: "session.expired" })
    const again = failing([expired()])
    expect(await providerCall({ write: true, send: again.send, refresh: async () => true })).toBe("done")
    const twice = failing([expired(), expired()])
    await expect(providerCall({ write: false, send: twice.send, refresh: async () => true })).rejects.toMatchObject({
      details: { reason: "session.expired" },
    })
    const refused = failing([expired()])
    await expect(providerCall({ write: false, send: refused.send, refresh: async () => false })).rejects.toMatchObject({
      details: { reason: "session.expired" },
    })
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
