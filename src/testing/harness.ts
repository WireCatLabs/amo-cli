import { Readable } from "node:stream"
import { type KeyringStore, memoryKeyring } from "@wirecat/cli-base"
import type { RunOptions } from "@wirecat/cli-core/cli"
import { encodeSignIn } from "../amo/account.js"
import type { AmoEnvironment } from "../context.js"
import { run } from "../program.js"
import { FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID, type FakeAmo, fakeAmo } from "./fake-amo.js"

export const FAKE_SIGN_IN = encodeSignIn({ origin: FAKE_ORIGIN, token: FAKE_TOKEN, userId: String(FAKE_USER_ID) })

/** A keyring where profile `work` is already signed in to the fake account; never the real one (WC-TEST-2). */
export const signedIn = (): KeyringStore => memoryKeyring({ "amo-cli:token:work": FAKE_SIGN_IN })

export interface Ran {
  code: number
  out: string
  err: string
  /** stdout parsed, or the error object from stderr. */
  json: () => Record<string, unknown>
}

/** `amo` through its own `run()`, as a person or an agent types it, against the fake account, with no real waits. */
export const amo = async (
  argv: string[],
  {
    account = fakeAmo(),
    keyring = signedIn(),
    stdin,
    env,
    answer,
    openBrowser,
  }: {
    account?: { fetch: ReturnType<typeof fakeAmo>["fetch"] }
    keyring?: KeyringStore
    stdin?: string
    env?: NodeJS.ProcessEnv
    /** The owner's answer to a question; cli-core never asks under --json, so a test of `ask` leaves it out. */
    answer?: (question: string) => Promise<string | null> | string | null
    /** Plays the browser at an OAuth sign-in. */
    openBrowser?: (url: string) => Promise<void>
  } = {},
): Promise<Ran> => {
  const out: string[] = []
  const err: string[] = []
  let clock = Date.now()
  const options: RunOptions & AmoEnvironment = {
    streams: { data: (text) => out.push(text), diagnostic: (text) => err.push(text) },
    tty: false,
    keyring,
    fetch: account.fetch,
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    ...(env ? { env: { ...process.env, ...env } } : {}),
    ...(answer ? { answer } : {}),
    ...(openBrowser ? { openBrowser } : {}),
    ...(stdin === undefined ? {} : { stdin: Object.assign(Readable.from([stdin]), { isTTY: false }) }),
  }
  const code = await run(argv, options)
  const text = { out: out.join(""), err: err.join("") }
  return { code, ...text, json: () => JSON.parse(text.out.trim() || text.err.trim()) as Record<string, unknown> }
}

/** The fake account synced into the test's store; `ref` finds the stored copy's `deal:<n>` of a lead id. */
export const synced = async (account: FakeAmo = fakeAmo({ perSecond: 10_000 })) => {
  const ran = await amo(["work", "sync", "--json"], { account })
  if (ran.code !== 0) throw new Error(`sync failed: ${ran.err}`)
  const listed = (await amo(["work", "deals", "list", "--json"], { account })).json() as {
    items: { ref: string; external_id: string }[]
  }
  const refs = new Map(listed.items.map((one) => [one.external_id, one.ref]))
  const ref = (leadId: number) => {
    const found = refs.get(String(leadId))
    if (!found) throw new Error(`no stored copy of lead ${leadId}`)
    return found
  }
  return { account, ref }
}
