import type { ManifestIdentity } from "@wirecat/cli-base/wcat/manifest"
import type { AppIdentity } from "@wirecat/cli-core/cli"
import { DETAILS, REASONS } from "./reasons.js"
import { VERSION } from "./version.js"

export const PACKAGE = "@wirecat/amo-cli"

export const IDENTITY: AppIdentity = {
  command: "amo",
  appName: "amo-cli",
  envPrefix: "AMO",
  description: "read and change an amoCRM or Kommo account's CRM",
  version: VERSION,
  issues: "https://github.com/WireCatLabs/amo-cli/issues/new",
  messenger: false,
  contentLanguages: ["ru", "en"],
  // amo paces itself to 5 requests a second (src/context.ts); a run's budget counts on half that.
  requestMs: 400,
  errors: { reasons: REASONS, details: DETAILS },
}

// The bin hands this to wcatStart before the program loads, so it must not import the command tree; src/wcat.ts adds
// the permission keys for the manifest.
export const DESKTOP: ManifestIdentity = {
  ...IDENTITY,
  docs: "https://github.com/WireCatLabs/amo-cli#readme",
  // Each account lives on its own host under one of these (src/amo/account.ts); amo reaches only the one signed in.
  hosts: ["*.amocrm.ru", "*.amocrm.com", "*.kommo.com"],
  userHosts: "the amoCRM or Kommo account you sign in to, such as example.amocrm.ru",
  tagline: "amoCRM and Kommo CRM: deals, contacts and companies",
  signIn: {
    gives: "Lets your agent read and change the account's CRM with the rights of the administrator who made the token.",
    asks: "The account's address and a long-lived token, from a private integration's Keys and scopes tab.",
  },
}

export const SKILL = new URL("../skills/amo-cli/SKILL.md", import.meta.url)
