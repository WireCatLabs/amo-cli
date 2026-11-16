import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError, type KeyringStore, resolvePaths } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  type AccountRemoval,
  accountFileFor,
  accountRemoveCommand,
  LOCAL_READ,
  LOCAL_WRITE,
  profilesHere,
} from "@wirecat/cli-core/cli"
import { oauthAccount } from "@wirecat/cli-core/oauth"
import type { AccountKey } from "@wirecat/cli-core/store"
import { Command } from "commander"
import { PROVIDER as OAUTH_PROVIDER } from "../amo/oauth.js"
import { configuration } from "../config.js"
import { contextOf } from "../context.js"
import { IDENTITY } from "../identity.js"
import { PROVIDER } from "../store.js"
import { signedInAs } from "./session.js"

/** What `session start` remembered, `<host>:<user id>`: it outlives `session end`, so a copy can still be found. */
const rememberedOf = (env: NodeJS.ProcessEnv, profile: string) => {
  try {
    const { account } = JSON.parse(readFileSync(accountFileFor(IDENTITY, profile, env), "utf8"))
    const parts = typeof account === "string" ? /^(.+):(\d+)$/.exec(account) : null
    return parts?.[1] && parts[2] ? { host: parts[1], userId: parts[2] } : undefined
  } catch {
    return undefined
  }
}

const hostOf = (env: NodeJS.ProcessEnv, keyring: KeyringStore | undefined, profile: string) => {
  try {
    return (signedInAs(env, keyring, profile) ?? rememberedOf(env, profile))?.host
  } catch {
    return rememberedOf(env, profile)?.host
  }
}

const removal: AccountRemoval = {
  // amoCRM has no call that revokes a long-lived token or an integration's tokens; the integration's card does.
  signOut: async (profile) => ({
    revoked: null,
    removed: [`the sign-in of ${profile} (the integration and its keys stay in amoCRM)`],
  }),
  account: (profile, { env, keyring }): AccountKey | undefined => {
    const host = hostOf(env, keyring, profile)
    return host ? { provider: PROVIDER.name, account: host } : undefined
  },
  secrets: (profile, { env, keyring }) => [
    {
      credentials: {
        configDir: resolvePaths({ appName: IDENTITY.appName, prefix: IDENTITY.envPrefix, env }).config,
        service: IDENTITY.appName,
        envVar: `${IDENTITY.envPrefix}_TOKEN`,
        env,
        ...(keyring ? { keyring } : {}),
      },
      accounts: [`token:${profile}`, oauthAccount(OAUTH_PROVIDER, profile)],
    },
  ],
  stateFiles: (profile, { env }) => [
    join(resolvePaths({ appName: IDENTITY.appName, prefix: IDENTITY.envPrefix, env }).state, "crm", profile),
  ],
}

/** The store keeps one copy per account host, so deleting one profile's data deletes every profile's on that host. */
const refuseSharedDelete = (command: Command) => {
  if (command.opts().deleteData !== true) return
  const { env, keyring, profile, renderer } = contextOf(command)
  const own = hostOf(env, keyring, profile)
  if (!own) return
  // biome-ignore lint/plugin/no-own-settings: this check reads every profile, and baseContext names one
  const { configuredProfiles } = configuration.resolveSettings({}, { env, needsProfile: false })
  const sharing = profilesHere(IDENTITY, configuredProfiles, env).filter(
    (one) => one !== profile && hostOf(env, keyring, one) === own,
  )
  if (sharing.length === 0) return
  const names = sharing.join(", ")
  // A dry run lists what --delete-data would delete, and says the real run refuses.
  if (command.opts().dryRun === true) {
    renderer.warn(`without --dry-run this refuses: ${names} also read${sharing.length === 1 ? "s" : ""} ${own}`)
    return
  }
  throw new CliError(
    "conflict",
    `${names} also read${sharing.length === 1 ? "s" : ""} ${own}, and the store keeps one copy of an account: ` +
      `--delete-data would delete their deals, contacts and companies too. Use --keep-data, or remove ${names} first`,
    { reason: "account-remove.account-shared", profiles: sharing, account: own },
  )
}

export const accountCommand = (): Command =>
  annotate(new Command("account"), { effects: LOCAL_READ })
    .description("this profile on this computer")
    .addCommand(
      annotate(accountRemoveCommand(IDENTITY, removal, { resolveSettings: configuration.resolveSettings }), {
        effects: LOCAL_WRITE,
      }).hook("preAction", (_, action) => refuseSharedDelete(action)),
    )
