import type { KeyringStore } from "@wirecat/cli-base"
import { ProfileTokenStore, recalledAccount } from "@wirecat/cli-core/cli"
import type { CrmAccountOptions } from "@wirecat/cli-core/crm/cli"
import { decodeSignIn } from "../amo/account.js"
import { appStorage } from "../amo/oauth.js"
import { configuration } from "../config.js"
import { withoutKeyring } from "../context.js"
import { IDENTITY } from "../identity.js"
import { PROVIDER } from "../store.js"

/** What `session start` remembered, `<host>:<user id>`: it outlives `session end`, so a copy can still be found. */
const rememberedOf = (profile: string, env: NodeJS.ProcessEnv) => {
  const parts = /^(.+):(\d+)$/.exec(recalledAccount(IDENTITY, PROVIDER.name, profile, env)?.account ?? "")
  return parts?.[1] && parts[2] ? { account: parts[1], user: parts[2] } : undefined
}

/** The account host and user a profile's saved sign-in reaches, either kind; one from `AMO_TOKEN` is no profile's. */
const signedInAs = (profile: string, env: NodeJS.ProcessEnv, keyring: KeyringStore | undefined) => {
  const tokens = new ProfileTokenStore({ app: IDENTITY, env, ...(keyring ? { keyring } : {}), warn: () => {} })
  const app = withoutKeyring(
    () => appStorage(env, profile, keyring).read()?.account,
    () => tokens.read(profile),
  )
  if (app) return { account: new URL(app.host).host, user: app.userId }
  const saved = tokens.read(profile)
  if (!saved || saved.source === "environment") return undefined
  const signIn = decodeSignIn(saved.secret)
  return { account: new URL(signIn.origin).host, user: signIn.userId }
}

/** The store names an amoCRM account by its host, and one account has several users. */
export const AMO_ACCOUNT: CrmAccountOptions = {
  provider: PROVIDER.name,
  service: "amoCRM",
  held: (profile, { env, keyring }) => {
    const remembered = rememberedOf(profile, env)
    try {
      const saved = signedInAs(profile, env, keyring)
      if (saved) return { ...saved, signedIn: true }
    } catch (error) {
      // Nothing else tells which account's copy --delete-data would delete.
      if (!remembered) throw error
    }
    return remembered && { ...remembered, signedIn: false }
  },
  // amoCRM has no call that revokes a long-lived token or an integration's tokens; the integration's card does.
  signedOut: (profile) => `the sign-in of ${profile} (the integration and its keys stay in amoCRM)`,
  resolveSettings: configuration.resolveSettings,
}
