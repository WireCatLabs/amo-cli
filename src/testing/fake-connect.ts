import { CLAIM_URL } from "../amo/oauth.js"
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_CODE, FAKE_HOST, type FakeAmo } from "./fake-amo.js"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

export type Step = "keys" | "not_ready" | number

/** The claim endpoint: each call answers the next step, the last one repeating. */
export const fakeClaim = (steps: Step[]) => {
  const bodies: unknown[] = []
  const answer = (step: Step) => {
    if (step === "keys") return json(200, { client_id: FAKE_CLIENT_ID, client_secret: FAKE_CLIENT_SECRET })
    if (step === "not_ready") return json(404, { error: "not_ready" })
    return json(step, { error: "broken", client_secret: FAKE_CLIENT_SECRET })
  }
  return {
    bodies,
    fetch: async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : input)
      if (url.pathname !== "/api/amo/claim" || init.method !== "POST") return json(404, { error: "not_found" })
      bodies.push(JSON.parse(String(init.body)))
      return answer(steps[Math.min(bodies.length - 1, steps.length - 1)] ?? "not_ready")
    },
  }
}

export type Send = (query: Record<string, string>) => Promise<number>

/** Plays the person and the relay page: amoCRM's redirect reaches amo's local port as the page forwards it. */
export const browser = (play: (send: Send, state: string) => Promise<void>) => {
  const opened: URL[] = []
  return {
    opened,
    openBrowser: async (given: string) => {
      const url = new URL(given)
      opened.push(url)
      const state = new URLSearchParams(url.hash.slice(1)).get("state") ?? ""
      const port = state.split(".")[0]
      const send: Send = async (query) =>
        (await fetch(`http://127.0.0.1:${port}/callback?${new URLSearchParams(query)}`)).status
      await play(send, state)
    },
  }
}

export const allowed = (referer = FAKE_HOST) =>
  browser(async (send, state) => void (await send({ code: FAKE_CODE, state, referer })))

/** The claim to the fake claim server, everything else to the fake account. */
export const routed = (claim: ReturnType<typeof fakeClaim>, account: FakeAmo, connect = CLAIM_URL) => {
  const host = new URL(connect).host
  return ((input: string | URL | Request, init?: RequestInit) =>
    new URL(input instanceof Request ? input.url : input).host === host
      ? claim.fetch(input, init)
      : account.fetch(input, init)) as FakeAmo["fetch"]
}
