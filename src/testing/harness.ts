import { Readable } from "node:stream"
import { type KeyringStore, memoryKeyring } from "@wirecat/cli-base"
import type { RunOptions } from "@wirecat/cli-core/cli"
import { encodeSignIn } from "../amo/account.js"
import type { AmoEnvironment } from "../context.js"
import { run } from "../program.js"
import { FAKE_ORIGIN, FAKE_TOKEN, FAKE_USER_ID, fakeAmo } from "./fake-amo.js"

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
  }: {
    account?: { fetch: ReturnType<typeof fakeAmo>["fetch"] }
    keyring?: KeyringStore
    stdin?: string
    env?: NodeJS.ProcessEnv
    /** The owner's answer to a question; cli-core never asks under --json, so a test of `ask` leaves it out. */
    answer?: (question: string) => string | null
  } = {},
): Promise<Ran> => {
  const out: string[] = []
  const err: string[] = []
  const options: RunOptions & AmoEnvironment = {
    streams: { data: (text) => out.push(text), diagnostic: (text) => err.push(text) },
    tty: false,
    keyring,
    fetch: account.fetch,
    sleep: async () => {},
    ...(env ? { env: { ...process.env, ...env } } : {}),
    ...(answer ? { answer } : {}),
    ...(stdin === undefined ? {} : { stdin: Object.assign(Readable.from([stdin]), { isTTY: false }) }),
  }
  const code = await run(argv, options)
  const text = { out: out.join(""), err: err.join("") }
  return { code, ...text, json: () => JSON.parse(text.out.trim() || text.err.trim()) as Record<string, unknown> }
}
