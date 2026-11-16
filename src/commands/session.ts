import { CliError, type KeyringStore } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { readSecret } from "@wirecat/cli-core"
import {
  commandWords,
  environmentOf,
  FETCH,
  type GlobalFlags,
  itemOf,
  LOCAL_READ,
  LOCAL_WRITE,
  listOf,
  logsInOrOut,
  openBrowser,
  outputFor,
  ProfileTokenStore,
  profileFree,
  profilesHere,
  REMOTE_READ,
  refuseCommandName,
  refuseOffline,
  refuseUnderReadOnly,
  rememberAccount,
  renderAnswer,
  rootOf,
  secretInputOf,
  signInSteps,
  type TokenStorage,
} from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { accountOrigin, decodeSignIn, encodeSignIn } from "../amo/account.js"
import { appSignIn, appSourceOf, appStorage, RELAY_URL } from "../amo/oauth.js"
import { configuration } from "../config.js"
import { type AmoEnvironment, appAuthFor, contextOf, storedSignIn, transportFor, withAccount } from "../context.js"
import { IDENTITY } from "../identity.js"
import { accountUser } from "../whoami.js"

const AMO = IDENTITY.command

const answer = (command: Command, item: unknown) => renderAnswer(command, outputFor(command), itemOf(item))

const storageOf = (raw: string): TokenStorage => {
  if (raw === "keyring" || raw === "file") return raw
  throw new CliError("validation_error", `--credential-storage takes keyring or file; got ${raw}`)
}

const tokensHere = (env: NodeJS.ProcessEnv, keyring: KeyringStore | undefined) =>
  new ProfileTokenStore({ app: IDENTITY, env, ...(keyring ? { keyring } : {}) })

/** The account host and user a profile's saved sign-in reaches, either kind; one from `AMO_TOKEN` is no profile's. */
export const signedInAs = (env: NodeJS.ProcessEnv, keyring: KeyringStore | undefined, profile: string) => {
  const app = appStorage(env, profile, keyring).read()?.account
  if (app) return { host: new URL(app.host).host, userId: app.userId }
  const saved = tokensHere(env, keyring).read(profile)
  if (!saved || saved.source === "environment") return undefined
  const signIn = decodeSignIn(saved.secret)
  return { host: new URL(signIn.origin).host, userId: signIn.userId }
}

/** A second profile on the same account and user would sync the same copy twice and split its permissions. */
const refuseDuplicate = (
  env: NodeJS.ProcessEnv,
  keyring: KeyringStore | undefined,
  profile: string,
  at: { host: string; userId: string },
) => {
  // biome-ignore lint/plugin/no-own-settings: this check reads every profile, and baseContext names one
  const { configuredProfiles } = configuration.resolveSettings({}, { env, needsProfile: false })
  const other = profilesHere(IDENTITY, configuredProfiles, env).find((one) => {
    if (one === profile) return false
    try {
      const found = signedInAs(env, keyring, one)
      return found?.host === at.host && found.userId === at.userId
    } catch {
      return false
    }
  })
  if (!other) return
  throw new CliError(
    "conflict",
    `profile ${other} already signs in to ${at.host} as user ${at.userId}. Use \`${AMO} ${other}\`, sign it in ` +
      `again with \`${AMO} ${other} session start\`, or end it with \`${AMO} ${other} session end\` first`,
    { reason: "session.duplicate", profile: other, account: at.host },
  )
}

/**
 * A long-lived token proven against its account, and what a profile keeps for it: the sign-in with the address and
 * the token's user, and the account as `session start` remembers it. `setup apply` runs the same check.
 */
export const checkedToken = async (command: Command, origin: string, token: string) => {
  const { env, profile, keyring, run } = contextOf(command)
  const who = await run((events) => accountUser(transportFor(command, { origin, token }, events)))
  refuseDuplicate(env, keyring, profile, { host: who.account, userId: who.user.id })
  return {
    who,
    signIn: encodeSignIn({ origin, token, userId: who.user.id }),
    account: `${who.account}:${who.user.id}`,
  }
}

const PASTE = "If the browser did not come back here, paste the address it ended on: "

interface StartArgs {
  host: string
  credentialStorage: TokenStorage
  clientId?: string
}

/** The owner's own integration in the browser; its secret is never a flag (WC-SECR-5). */
const startWithApp = async (command: Command, args: StartArgs, origin: string) => {
  const { env, profile, tokens, keyring, run, environment } = contextOf(command)
  const clientId = (args.clientId ?? env[CLIENT_ID] ?? "").trim()
  const clientSecret =
    env[CLIENT_SECRET]?.trim() || (await readSecret("amoCRM integration secret key: ", secretInputOf(command))).trim()
  if (!clientSecret) throw new CliError("validation_error", "no secret key was given")
  const flags = command.optsWithGlobals<GlobalFlags & { input?: boolean }>()
  const machine = flags.json === true || flags.jsonl === true
  const person = !machine && flags.input !== false && !env.CI && (environment.tty ?? process.stdout.isTTY) === true
  const { streams } = outputFor(command)
  const steps = signInSteps({
    diagnostic: (line) => streams.diagnostic(`${line}\n`),
    json: machine || environment.tty === false,
    answers: false,
  })
  const input = secretInputOf(command).input ?? process.stdin
  const given = environment.answer
  const signInCommand = `${AMO} ${profile} session start --host ${origin} --client-id ${clientId}`
  const who = await run((events) =>
    appSignIn({
      env,
      profile,
      origin,
      client: { clientId, clientSecret },
      storage: args.credentialStorage,
      keyring,
      fetch: environment.fetch as typeof fetch | undefined,
      signal: environment.signal,
      signInCommand,
      steps: {
        openBrowser: async (url) => {
          if (environment.openBrowser) return environment.openBrowser(url)
          if (person) await openBrowser(url)
        },
        showUrl: (url) => {
          steps.openUrl(url, "Sign in to amoCRM and allow the integration")
          streams.diagnostic(`Open the amoCRM sign-in: ${url}\n`)
        },
        // A pipe was the secret, and an empty answer would end the sign-in before the browser came back.
        ...(given
          ? {
              readPaste: async () => {
                const text = await given(PASTE)
                if (text === null) throw new CliError("cancelled", "nobody is at a terminal to paste")
                return text
              },
            }
          : input.isTTY && !machine
            ? {
                readPaste: (signal: AbortSignal) =>
                  readSecret(PASTE, { ...secretInputOf(command), echo: true, signal }),
              }
            : {}),
      },
      check: async (auth) => {
        const found = await accountUser(transportFor(command, auth, events))
        refuseDuplicate(env, keyring, profile, { host: found.account, userId: found.user.id })
        return { ...found, id: found.user.id }
      },
    }),
  )
  tokens.remove(profile)
  rememberAccount(IDENTITY, profile, `${who.account}:${who.user.id}`, env)
  const { id: _id, ...found } = who
  return {
    profile,
    state: "saved",
    kind: "app",
    stored_in: appSourceOf(env, profile, keyring) ?? args.credentialStorage,
    verified: true,
    ...found,
  }
}

const CLIENT_ID = `${IDENTITY.envPrefix}_AMOCRM_CLIENT_ID`
const CLIENT_SECRET = `${IDENTITY.envPrefix}_AMOCRM_CLIENT_SECRET`

const startCommand = () =>
  logsInOrOut(
    annotate(new Command("start"), {
      effects: FETCH,
      lifetime: "interactive",
      mcp: false,
      examples: [
        `${AMO} work session start --host https://example.amocrm.ru`,
        `${AMO} work session start --host https://example.kommo.com --json`,
        `${AMO} work session start --host https://example.amocrm.ru --client-id 0123abcd-4567-89ef-0123-456789abcdef`,
      ],
    }),
  )
    .summary("sign in to amoCRM or Kommo with a long-lived token or your own integration")
    .description(
      "sign this profile in: --host names the account, and its long-lived token (a private integration → Keys and " +
        "scopes → Generate a long-lived token) is asked hidden or read from stdin, never taken as an argument, " +
        "checked against the account, and only then kept in the keyring with the address, or in a private file. " +
        "The token acts with the rights of the administrator who made it. With --client-id it signs in through " +
        "that integration in the browser instead: its secret key is asked hidden or read from stdin, and the tokens " +
        `act with the rights of the user who signs in; the integration's Redirect URI must be ${RELAY_URL}. ` +
        "Each sign-in forgets the profile's other kind",
    )
    .requiredOption("--host <address>", "the account's address, such as https://example.amocrm.ru, kept as given")
    .option(
      "--client-id <id>",
      `the integration's ID (client_id), or ${CLIENT_ID}; its secret key comes from ${CLIENT_SECRET}, a hidden ` +
        "prompt or stdin",
    )
    .option(
      "--credential-storage <storage>",
      "where the sign-in is kept: keyring, which falls back to a private file by itself, or file",
      storageOf,
      "keyring" as TokenStorage,
    )
    .action(async function (this: Command, args: StartArgs) {
      const { env, profile, tokens, keyring } = contextOf(this)
      refuseCommandName(profile, commandWords(rootOf(this)), AMO)
      refuseOffline(this, "the amoCRM account")
      const origin = accountOrigin(args.host)
      if (args.clientId !== undefined || env[CLIENT_ID]) return answer(this, await startWithApp(this, args, origin))
      // A secret is never an argument: it would land in shell history and in the run record (WC-SECR-5).
      const token = (await readSecret("amoCRM long-lived token: ", secretInputOf(this))).trim()
      if (!token) throw new CliError("validation_error", "no token was given")
      const { who, signIn, account } = await checkedToken(this, origin, token)
      const storedIn = tokens.write(profile, signIn, args.credentialStorage)
      appStorage(env, profile, keyring).remove()
      rememberAccount(IDENTITY, profile, account, env)
      answer(this, { profile, state: "saved", kind: "token", stored_in: storedIn, verified: true, ...who })
    })

const statusCommand = () =>
  annotate(new Command("status"), {
    effects: REMOTE_READ,
    examples: [`${AMO} work session status`, `${AMO} work session status --check --json`],
  })
    .summary("show how this profile signs in, and with --check as whom it acts")
    .description(
      "show which account this profile signs in to, with a long-lived token or an integration, and where that " +
        `comes from: ${IDENTITY.envPrefix}_TOKEN, the keyring or a file; never a token or the secret key`,
    )
    .option(
      "--check",
      "ask the account whether the sign-in still works and whose it is: the account, the user and admin",
    )
    .action(async function (this: Command, args: { check?: boolean }) {
      const { env, profile, tokens, keyring } = contextOf(this)
      const saved = tokens.read(profile)
      const app = saved?.source === "environment" ? undefined : appAuthFor(this)
      const signIn = storedSignIn(this)
      const status = {
        profile,
        state: signIn ? "saved" : "missing",
        kind: app ? "app" : signIn ? "token" : null,
        token_from: app ? (appSourceOf(env, profile, keyring) ?? null) : (saved?.source ?? null),
        account: signIn ? new URL(signIn.origin).host : null,
      }
      if (!args.check || !signIn) return answer(this, { ...status, verified: false })
      answer(this, { ...status, verified: true, ...(await withAccount(this, accountUser)) })
    })

const endCommand = () =>
  logsInOrOut(
    annotate(new Command("end"), {
      effects: LOCAL_WRITE,
      mcp: false,
      examples: [`${AMO} work session end`],
    }),
  )
    .summary("forget this profile's sign-in on this computer")
    .description(
      "forget this profile's long-lived token, or its integration's secret key and tokens, and the account address " +
        "on this computer; amoCRM has no call that revokes a token: revoke it on the integration's Keys and scopes " +
        "tab, or switch the integration off",
    )
    .action(function (this: Command) {
      refuseUnderReadOnly(this, "session end")
      const { env, profile, tokens, keyring } = contextOf(this)
      const ended = [...tokens.remove(profile), ...appStorage(env, profile, keyring).remove()]
      answer(this, { profile, ended: [...new Set(ended)] })
    })

const listCommand = () =>
  profileFree(
    annotate(new Command("list"), {
      effects: LOCAL_READ,
      examples: [`${AMO} session list`, `${AMO} session list --json`],
    }),
  )
    .summary("list the profiles here and whether each is signed in")
    .description("list the profiles on this computer, whether each has a token and for which account; picks none")
    .action(function (this: Command) {
      const environment = environmentOf<AmoEnvironment>(this)
      const env = environment.env ?? process.env
      // biome-ignore lint/plugin/no-own-settings: baseContext needs a profile, and this local read names none
      const { configuredProfiles } = configuration.resolveSettings({}, { env, needsProfile: false })
      const tokens = tokensHere(env, environment.keyring)
      const items = profilesHere(IDENTITY, configuredProfiles, env).map((profile) => {
        try {
          const saved = tokens.read(profile)
          const app = saved ? undefined : appStorage(env, profile, environment.keyring).read()?.account
          const host = app
            ? new URL(app.host).host
            : saved && saved.source !== "environment"
              ? new URL(decodeSignIn(saved.secret).origin).host
              : null
          const from = saved?.source ?? (app ? appSourceOf(env, profile, environment.keyring) : undefined)
          return { profile, signed_in: from !== undefined, token_from: from ?? null, account: host }
        } catch (error) {
          if (!(error instanceof CliError)) throw error
          return { profile, signed_in: null, token_from: null, account: null, error: error.message }
        }
      })
      renderAnswer(
        this,
        outputFor(this),
        listOf("session list", { items, limit: Math.max(1, items.length), has_more: false }),
      )
    })

export const sessionCommand = (): Command =>
  annotate(new Command("session"), { effects: LOCAL_READ })
    .description("keep this profile's amoCRM sign-in and account address in the OS keyring")
    .addCommand(startCommand())
    .addCommand(statusCommand())
    .addCommand(endCommand())
    .addCommand(listCommand())
