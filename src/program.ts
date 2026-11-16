import { join } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import {
  appDoctorCommand,
  appMcpCommand,
  commandsCommand,
  configCommand,
  createProgram as createSharedProgram,
  outputFor,
  ProfileTokenStore,
  type ProgramDefinition,
  type ProgramOptions,
  type RunOptions,
  run as runShared,
  runsCommand,
  skillCommand,
  upgradeCommand,
} from "@wirecat/cli-core/cli"
import { appUpdate } from "@wirecat/cli-core/update"
import type { Command } from "commander"
import { appSourceOf } from "./amo/oauth.js"
import { accountCommand } from "./commands/account.js"
import { apiCommand } from "./commands/api.js"
import { crmSharedCommands } from "./commands/crm-shared.js"
import { scheduleCommand } from "./commands/schedule.js"
import { sessionCommand } from "./commands/session.js"
import { configuration } from "./config.js"
import { IDENTITY, PACKAGE, SKILL } from "./identity.js"

const update = appUpdate({
  packageName: PACKAGE,
  command: IDENTITY.command,
  version: IDENTITY.version,
  entry: import.meta.url,
  statePath: (env) =>
    join(resolvePaths({ appName: IDENTITY.appName, prefix: IDENTITY.envPrefix, env }).state, "update-check.json"),
  // biome-ignore lint/plugin/no-own-settings: the update check runs before any command exists to give baseContext
  enabled: (env) => configuration.resolveSettings({}, { env, needsProfile: false }).updateCheck,
  offVariables: [`${IDENTITY.envPrefix}_NO_UPDATE_CHECK`],
})

const mcpCommand = () =>
  appMcpCommand(IDENTITY, configuration, {
    name: "amoCRM",
    untrusted: [
      "lead, contact and company names",
      "pipeline and stage names",
      "names of users",
      "custom field values, notes and tags",
      "phone numbers, e-mail addresses and links",
      "whatever api call returns",
    ],
    permissionExample: "deals.close=deny",
    skill: SKILL,
    signedIn: (profile, env, keyring) => {
      if (new ProfileTokenStore({ app: IDENTITY, env, ...(keyring ? { keyring } : {}) }).signedIn(profile)) return true
      try {
        return appSourceOf(env, profile, keyring) !== undefined
      } catch {
        return false
      }
    },
  })

export const definition = (): ProgramDefinition => ({
  app: IDENTITY,
  // The whole object: cli-core refuses a command by its key only when it gets the permission table too.
  configuration,
  firstScreen: {
    pitch: "an amoCRM or Kommo account's CRM for scripts and agents, with a permission on every write.",
    can: [
      { command: "sync", does: "copy your deals and their contacts and companies; the next sync takes the changes" },
      { command: "deals list status:open", does: "open deals with stage, amount and owner, from the store, offline" },
      { command: 'search all "kitchen"', does: "stored deals beside your other WireCat tools' data" },
      { command: "deals move <ref> <stage>", does: "move a deal; deals.move=readonly stops agents moving one" },
      { command: 'people list "Anna"', does: "any contact, read live from the account" },
      {
        command: 'api call "GET /api/v4/leads" --dry-run',
        does: "any API v4 operation, with every permission it checks",
      },
    ],
    start: `${IDENTITY.command} work session start --host https://example.amocrm.ru`,
  },
  commands: () => [
    commandsCommand(IDENTITY),
    sessionCommand(),
    accountCommand(),
    ...crmSharedCommands(),
    apiCommand(),
    scheduleCommand(),
    appDoctorCommand(IDENTITY, configuration, { packageName: PACKAGE }),
    skillCommand(IDENTITY, SKILL),
    mcpCommand(),
    upgradeCommand(IDENTITY, PACKAGE, (command) => ({
      ...outputFor(command),
      installer: () => update.installer({}),
      latest: () => update.latest({}),
      install: (argv) => update.runUpdate(argv, {}),
    })),
    configCommand(IDENTITY, configuration),
    runsCommand(IDENTITY),
  ],
})

export const createProgram = (options?: ProgramOptions): Command => createSharedProgram(definition(), options)

export const run = (argv: string[], options?: RunOptions): Promise<number> => runShared(argv, definition(), options)
