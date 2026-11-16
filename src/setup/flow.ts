import { CliError } from "@wirecat/cli-base"
import { defineSetup, type SetupCheck } from "@wirecat/cli-core/cli"
import { accountOrigin } from "../amo/account.js"
import { appStorage } from "../amo/oauth.js"
import { checkedToken } from "../commands/session.js"
import { configuration } from "../config.js"
import { contextOf, storedSignIn, withAccount } from "../context.js"
import { IDENTITY } from "../identity.js"
import { accountUser } from "../whoami.js"
import en from "./texts.en.json" with { type: "json" }
import es from "./texts.es.json" with { type: "json" }
import ru from "./texts.ru.json" with { type: "json" }

/**
 * The same proof `session start` runs, and the same sign-in it keeps: the address and the token's user beside the
 * token. Editing a profile without a new token keeps the old one only for the same account.
 */
const check: SetupCheck = async ({ command, settings, secrets }) => {
  const origin = accountOrigin(String(settings.configured.host ?? ""))
  const typed = secrets.token?.trim()
  if (typed) {
    const { who, signIn, account } = await checkedToken(command, origin, typed)
    const { env, profile, keyring } = contextOf(command)
    // A request prefers an integration's sign-in to the token, so it would hide the token just proven.
    appStorage(env, profile, keyring).remove()
    return { ...who, keep: { secrets: { token: signIn }, account } }
  }
  const kept = storedSignIn(command)
  if (kept?.origin !== origin)
    throw new CliError("validation_error", `a new account needs its own token: ${new URL(origin).host}`, {
      reason: "account.token-missing",
      param: "token",
    })
  const who = await withAccount(command, accountUser)
  return { ...who, keep: { account: `${who.account}:${who.user.id}` } }
}

const OAUTH_COMMAND = "amo <profile> session start --host https://<subdomain>.amocrm.ru --client-id <integration ID>"

export const amoSetup = defineSetup({
  app: IDENTITY,
  configuration,
  check,
  start: "account",
  steps: {
    account: {
      title: "account.title",
      blocks: [
        { type: "text", text: "account.intro" },
        {
          type: "input",
          id: "host",
          setting: "host",
          input: "text",
          label: "account.host",
          hint: "account.host.hint",
          placeholder: "account.host.placeholder",
        },
      ],
      next: "integration",
    },
    integration: {
      title: "integration.title",
      blocks: [
        { type: "text", text: "integration.amocrm" },
        { type: "note", role: "warning", text: "integration.waiver" },
        {
          type: "group",
          role: "details",
          title: "integration.kommo.title",
          blocks: [{ type: "text", text: "integration.kommo" }],
        },
      ],
      next: "token",
    },
    token: {
      title: "token.title",
      blocks: [
        { type: "text", text: "token.where" },
        { type: "input", id: "token", secret: "token", input: "password", label: "token.label", hint: "token.hint" },
        { type: "note", role: "tip", text: "token.rights" },
      ],
      next: "check",
    },
    check: {
      kind: "run",
      title: "check.title",
      action: "apply",
      blocks: [{ type: "text", text: "check.body" }],
      next: [
        { when: { result: "check", is: "ok" }, to: "done" },
        { when: { result: "check", error: "authentication_error" }, to: "token" },
        { when: { result: "check", error: "validation_error" }, to: "account" },
        { when: { result: "check", error: "conflict" }, to: "account" },
        { to: "failed" },
      ],
      back: false,
    },
    failed: {
      kind: "done",
      title: "failed.title",
      blocks: [{ type: "note", role: "danger", text: "failed.body" }],
      back: true,
    },
    done: {
      kind: "done",
      title: "done.title",
      blocks: [
        { type: "text", text: "done.body" },
        { type: "code", code: "amo <profile> sync\namo <profile> deals list status:open", copy: true },
        {
          type: "group",
          role: "details",
          title: "done.oauth.title",
          blocks: [
            { type: "text", text: "done.oauth" },
            { type: "code", code: OAUTH_COMMAND, copy: true },
          ],
        },
      ],
    },
  },
  texts: { en, ru, es },
})
