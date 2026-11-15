import { CliError, type KeyringStore } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { readSecret } from "@wirecat/cli-core"
import {
  commandWords,
  environmentOf,
  FETCH,
  itemOf,
  LOCAL_READ,
  LOCAL_WRITE,
  listOf,
  logsInOrOut,
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
  type TokenStorage,
} from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { accountOrigin, decodeSignIn, encodeSignIn } from "../amo/account.js"
import { configuration } from "../config.js"
import { type AmoEnvironment, contextOf, storedSignIn, transportFor, withAccount } from "../context.js"
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

/** A second profile on the same account and user would sync the same copy twice and split its permissions. */
const refuseDuplicate = (
  env: NodeJS.ProcessEnv,
  keyring: KeyringStore | undefined,
  profile: string,
  at: { host: string; userId: string },
) => {
  // biome-ignore lint/plugin/no-own-settings: this check reads every profile, and baseContext names one
  const { configuredProfiles } = configuration.resolveSettings({}, { env, needsProfile: false })
  const tokens = tokensHere(env, keyring)
  const other = profilesHere(IDENTITY, configuredProfiles, env).find((one) => {
    if (one === profile) return false
    const saved = tokens.read(one)
    if (!saved || saved.source === "environment") return false
    try {
      const signIn = decodeSignIn(saved.secret)
      return new URL(signIn.origin).host === at.host && signIn.userId === at.userId
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

const startCommand = () =>
  logsInOrOut(
    annotate(new Command("start"), {
      effects: FETCH,
      lifetime: "interactive",
      mcp: false,
      examples: [
        `${AMO} work session start --host https://example.amocrm.ru`,
        `${AMO} work session start --host https://example.kommo.com --json`,
      ],
    }),
  )
    .summary("sign in to an amoCRM or Kommo account with a long-lived token")
    .description(
      "sign this profile in: --host names the account, and its long-lived token (a private integration → Keys and " +
        "scopes → Generate a long-lived token) is asked hidden or read from stdin, never taken as an argument, " +
        "checked against the account, and only then kept in the keyring with the address, or in a private file. " +
        "The token acts with the rights of the administrator who made it",
    )
    .requiredOption("--host <address>", "the account's address, such as https://example.amocrm.ru, kept as given")
    .option(
      "--credential-storage <storage>",
      "where the sign-in is kept: keyring, which falls back to a private file by itself, or file",
      storageOf,
      "keyring" as TokenStorage,
    )
    .action(async function (this: Command, args: { host: string; credentialStorage: TokenStorage }) {
      const { env, profile, tokens, run, keyring } = contextOf(this)
      refuseCommandName(profile, commandWords(rootOf(this)), AMO)
      refuseOffline(this, "the amoCRM account")
      const origin = accountOrigin(args.host)
      // A secret is never an argument: it would land in shell history and in the run record (WC-SECR-5).
      const token = (await readSecret("amoCRM long-lived token: ", secretInputOf(this))).trim()
      if (!token) throw new CliError("validation_error", "no token was given")
      const who = await run((events) => accountUser(transportFor(this, { origin, token }, events)))
      refuseDuplicate(env, keyring, profile, { host: who.account.host, userId: who.user.id })
      const storedIn = tokens.write(
        profile,
        encodeSignIn({ origin, token, userId: who.user.id }),
        args.credentialStorage,
      )
      rememberAccount(IDENTITY, profile, `${who.account.host}:${who.user.id}`, env)
      answer(this, { profile, state: "saved", kind: "token", stored_in: storedIn, verified: true, ...who })
    })

const statusCommand = () =>
  annotate(new Command("status"), {
    effects: REMOTE_READ,
    examples: [`${AMO} work session status`, `${AMO} work session status --check --json`],
  })
    .summary("show how this profile signs in, and with --check as whom it acts")
    .description(
      `show which account this profile signs in to and where its token comes from: ${IDENTITY.envPrefix}_TOKEN, the ` +
        "keyring or a file; never the token",
    )
    .option("--check", "ask the account whether the token still works and whose it is: the account, the user and admin")
    .action(async function (this: Command, args: { check?: boolean }) {
      const { profile, tokens } = contextOf(this)
      const saved = tokens.read(profile)
      const signIn = storedSignIn(this)
      const status = {
        profile,
        state: signIn ? "saved" : "missing",
        kind: signIn ? "token" : null,
        token_from: saved?.source ?? null,
        account: signIn ? { host: new URL(signIn.origin).host } : null,
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
    .summary("forget this profile's token on this computer")
    .description(
      "forget this profile's token and account address on this computer; the token stays valid in amoCRM, which has " +
        "no call that revokes one: revoke it on the integration's Keys and scopes tab",
    )
    .action(function (this: Command) {
      refuseUnderReadOnly(this, "session end")
      const { profile, tokens } = contextOf(this)
      answer(this, { profile, ended: tokens.remove(profile) })
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
          const host = saved && saved.source !== "environment" ? new URL(decodeSignIn(saved.secret).origin).host : null
          return { profile, signed_in: saved !== undefined, token_from: saved?.source ?? null, account: host }
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
    .description("keep this profile's amoCRM token and account address in the OS keyring")
    .addCommand(startCommand())
    .addCommand(statusCommand())
    .addCommand(endCommand())
    .addCommand(listCommand())
