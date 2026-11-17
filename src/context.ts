import { CliError, isCliError, type SleepLike } from "@wirecat/cli-base"
import type { FetchLike } from "@wirecat/cli-base/http"
import {
  type BaseEnvironment,
  baseContext,
  type EventSink,
  environmentOf,
  type GlobalFlags,
  ProfileTokenStore,
  refuseOffline,
} from "@wirecat/cli-core/cli"
import { Pacer, pacePathFor } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import { accountOrigin, decodeSignIn } from "./amo/account.js"
import { type AppAuth, appAuthOf } from "./amo/oauth.js"
import { type AmoAuth, AmoTransport } from "./amo/transport.js"
import { configuration } from "./config.js"
import { IDENTITY } from "./identity.js"

/** What a test hands `run()` in place of the account and real waiting (WC-ARCH-10). */
export interface AmoEnvironment extends BaseEnvironment {
  fetch?: FetchLike
  sleep?: SleepLike
  /** The clock the pace waits on; a test moves it with its `sleep`, so no wait is real. */
  now?: () => number
  /** In place of the system browser; a test plays the browser and the relay page. */
  openBrowser?: (url: string) => Promise<void>
}

/**
 * amoCRM allows 7 requests a second per integration and 50 per account (amocrm.ru developers "Рекомендации"; Kommo
 * "Limitations" says 7): 5 a second with no burst stays under it in any one-second window.
 */
export const ACCOUNT_PACE = { perMinute: 300, burst: 1 }

export const contextOf = (command: Command) => {
  const base = baseContext(command, configuration.resolveSettings)
  return {
    ...base,
    environment: environmentOf<AmoEnvironment>(command),
    flags: command.optsWithGlobals<GlobalFlags>(),
    profile: base.settings.profile,
    tokens: new ProfileTokenStore({
      app: IDENTITY,
      env: base.env,
      ...(base.keyring ? { keyring: base.keyring } : {}),
      warn: base.renderer.warn,
    }),
  }
}

export const HOST_VARIABLE = `${IDENTITY.envPrefix}_HOST`

/** The profile's integration sign-in, read with no network. */
export const appAuthFor = (command: Command): AppAuth | undefined => {
  const { env, profile, keyring, environment, tokens } = contextOf(command)
  return withoutKeyring(
    () =>
      appAuthOf({
        env,
        profile,
        keyring,
        ...(environment.fetch ? { fetch: environment.fetch as typeof fetch } : {}),
        signal: environment.signal,
      }),
    () => tokens.read(profile),
  )
}

/**
 * The integration's sign-in when the keyring does not answer: none, if the profile's long-lived token is found
 * elsewhere (a file), since each `session start` forgets the other kind; else cli-base's `keyring.unreachable`.
 */
export const withoutKeyring = <T>(read: () => T | undefined, token: () => unknown): T | undefined => {
  try {
    return read()
  } catch (error) {
    if (isCliError(error) && error.details.reason === "keyring.unreachable" && token() !== undefined) return undefined
    throw error
  }
}

/**
 * `AMO_TOKEN` first, as for every token CLI, with `AMO_HOST` naming its account; then the integration's sign-in, then
 * the saved long-lived token, which keeps the address beside it. One `session start` forgets the other kind.
 */
export const storedSignIn = (command: Command): AmoAuth | undefined => {
  const { env, profile, tokens } = contextOf(command)
  const stored = tokens.read(profile)
  if (stored?.source === "environment") {
    const host = env[HOST_VARIABLE]
    if (!host)
      throw new CliError(
        "configuration_error",
        `${tokens.variable} needs ${HOST_VARIABLE}, the account's address, such as https://example.amocrm.ru`,
        { reason: "account.host-missing" },
      )
    return { origin: accountOrigin(host), token: stored.secret }
  }
  return appAuthFor(command) ?? (stored ? decodeSignIn(stored.secret) : undefined)
}

/** The sign-in a request uses, or the "not signed in" refusal that names the command to sign in. */
export const signInOf = (command: Command): AmoAuth => {
  refuseOffline(command, "the amoCRM account")
  const found = storedSignIn(command)
  if (found) return found
  const { profile, tokens } = contextOf(command)
  tokens.need(profile)
  throw new CliError("authentication_error", `profile ${profile} is not signed in`)
}

export const transportFor = (command: Command, signIn: AmoAuth, events?: EventSink): AmoTransport => {
  const { environment, env, renderer } = contextOf(command)
  return new AmoTransport({
    signIn,
    warn: renderer.warn,
    ...(events ? { events } : {}),
    ...(environment.fetch ? { fetch: environment.fetch } : {}),
    ...(environment.signal ? { signal: environment.signal } : {}),
    ...(environment.sleep ? { sleep: environment.sleep } : {}),
    ...(environment.deadline ? { deadline: environment.deadline } : {}),
    ...(environment.now ? { now: environment.now } : {}),
    // amoCRM counts per integration and account: two profiles on one account share one pace.
    pacer: new Pacer(
      pacePathFor(IDENTITY, `account-${new URL(signIn.origin).hostname}`, env),
      ACCOUNT_PACE,
      environment.now,
    ),
  })
}

/** The body inside core's run: recorded, under `--timeout`, its requests in the run's events (WC-LIFE-17). */
export const withAccount = <T>(command: Command, body: (account: AmoTransport) => Promise<T>): Promise<T> =>
  contextOf(command).run((events) => body(transportFor(command, signInOf(command), events)))
