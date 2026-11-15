import type { MessageStore } from "@wirecat/cli-core/store"
import { IDENTITY } from "./identity.js"

export const PROVIDER = {
  name: "amocrm",
  kind: "crm",
  aliases: ["amo", "kommo"],
  command: IDENTITY.command,
} as const

/**
 * The shared store, with amo's provider entry written, so every other CLI's search knows it (WC-ARCH-21). A read-only
 * open writes nothing, the entry included, and fails when the file is missing or needs a migration.
 */
export const openAmoStore = async (env: NodeJS.ProcessEnv, { readOnly = false } = {}): Promise<MessageStore> => {
  const { ensureSqlite } = await import("@wirecat/cli-core/sqlite-runtime")
  await ensureSqlite()
  const { openStore, storePath } = await import("@wirecat/cli-core/store")
  const store = await openStore({
    path: storePath(env),
    env,
    command: IDENTITY.command,
    version: IDENTITY.version,
    ...(readOnly ? { readOnly } : {}),
  })
  try {
    if (!readOnly) await store.accounts.registerProvider(PROVIDER)
    return store
  } catch (error) {
    await store.close()
    throw error
  }
}
