import { outputFor } from "@wirecat/cli-core/cli"
import type { CrmRun } from "@wirecat/cli-core/crm/cli"
import { addCrmCommands, openCrmStore } from "@wirecat/cli-core/crm/cli"
import type { AccountKey } from "@wirecat/cli-core/store"
import { Command } from "commander"
import type { AmoTransport } from "../amo/transport.js"
import { crmApiKeys } from "../api-keys.js"
import { permissions } from "../config.js"
import { contextOf, signInOf, storedSignIn, transportFor } from "../context.js"
import { AMO_WRITES } from "../crm/writer.js"
import { IDENTITY } from "../identity.js"
import { accountUser } from "../whoami.js"

/** The selected profile's account for one command; cli-core closes the store before the answer prints. */
/**
 * A sign-in that cannot be read limits the reads to nobody's deals; the request that needs it says why. `AMO_TOKEN`
 * names no user, so the account says whose it is, once per command, as session start asks; kept nowhere. Offline, or
 * refused, it stays nobody's.
 */
const userOf = async (command: Command, amo: () => AmoTransport): Promise<string | null> => {
  let signIn: ReturnType<typeof storedSignIn>
  try {
    signIn = storedSignIn(command)
  } catch {
    return null
  }
  if (!signIn || signIn.userId) return signIn?.userId ?? null
  if (contextOf(command).tokens.read(contextOf(command).profile)?.source !== "environment") return null
  try {
    return (await accountUser(amo())).user.id || null
  } catch {
    return null
  }
}

const openProfile = async (command: Command, { readOnly }: { readOnly: boolean }): Promise<CrmRun> => {
  const { env, profile } = contextOf(command)
  const [{ openAmoStore, PROVIDER }, { amoCrmSource }, { amoCrmWriter }] = await Promise.all([
    import("../store.js"),
    import("../crm/source.js"),
    import("../crm/writer.js"),
  ])
  const accountOf = (): AccountKey => {
    const signIn = storedSignIn(command) ?? signInOf(command)
    return { provider: PROVIDER.name, account: new URL(signIn.origin).host }
  }
  const { store, account } = await openCrmStore({
    app: IDENTITY,
    env,
    profile,
    readOnly,
    provider: PROVIDER.name,
    open: openAmoStore,
    account: accountOf,
  })
  let transport: AmoTransport | undefined
  const amo = () => (transport ??= transportFor(command, signInOf(command)))
  let source: ReturnType<typeof amoCrmSource> | undefined
  const asked = async () => {
    const { crmSettingKey } = await import("@wirecat/cli-core/store")
    const scope = await store.crm.scope(account)
    return {
      mode: scope.mode,
      setting: crmSettingKey(account, "scope"),
      chosen: crmSettingKey(account, "unassigned"),
    }
  }
  // Only a sync copies: every other command reads `self` too (a non-admin's own clients), and must answer under `all`.
  const crm = () => (source ??= amoCrmSource(amo, command.name() === "sync" ? { asked } : {}))
  const user = await userOf(command, amo)
  return {
    profile,
    account,
    user,
    store,
    env,
    locked: Boolean(env[`${IDENTITY.envPrefix}_PROFILE_LOCK`]),
    source: crm,
    writes: () => {
      const userId = signInOf(command).userId ?? user ?? undefined
      return {
        writer: amoCrmWriter(amo, crm()),
        app: IDENTITY,
        env,
        ...(userId ? { self: userId } : {}),
        warn: outputFor(command).renderer.warn,
        alsoChecks: crmApiKeys,
        // contextOf, not resolveSettings: it carries the levels `mcp serve --permission` tightened.
        settings: () => ({ ...contextOf(command).settings, permissionDefaults: permissions.defaults }),
      }
    },
    close: () => store.close(),
  }
}

/**
 * cli-core's shared CRM commands over the account: `sync`, `store status`, `deals`, `pipelines`, `stages`, `fields`,
 * `activities` and `changes`, and `people`, `organizations` and `users` read live. amoCRM has no leads apart from its
 * deals.
 */
export const crmSharedCommands = (): Command[] => {
  const holder = new Command(IDENTITY.command)
  addCrmCommands(holder, {
    app: IDENTITY,
    open: openProfile,
    leads: false,
    writes: AMO_WRITES,
    live: ["person", "organization", "user"],
    activities: true,
  })
  return [...holder.commands]
}
