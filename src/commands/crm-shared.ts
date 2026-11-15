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

/** The selected profile's account for one command; cli-core closes the store before the answer prints. */
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
  const crm = () => (source ??= amoCrmSource(amo, { asked }))
  return {
    profile,
    account,
    store,
    env,
    locked: Boolean(env[`${IDENTITY.envPrefix}_PROFILE_LOCK`]),
    source: crm,
    writes: () => {
      const { userId } = signInOf(command)
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
 * and `people`, `organizations` and `users` read live. amoCRM has no leads apart from its deals.
 */
export const crmSharedCommands = (): Command[] => {
  const holder = new Command(IDENTITY.command)
  addCrmCommands(holder, {
    app: IDENTITY,
    open: openProfile,
    leads: false,
    writes: AMO_WRITES,
    live: ["person", "organization", "user"],
  })
  return [...holder.commands]
}
