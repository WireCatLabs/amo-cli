import { CliError } from "@wirecat/cli-base"
import {
  commandWords,
  defineSetup,
  refuseCommandName,
  refuseOffline,
  rootOf,
  type SetupCheck,
} from "@wirecat/cli-core/cli"
import { accountOrigin } from "../amo/account.js"
import { appStorage } from "../amo/oauth.js"
import { checkedToken, signInWithButton } from "../commands/session.js"
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
const check: SetupCheck = async ({ command, settings, secrets, answers, steps }) => {
  // The guards `session start` runs before it signs in.
  refuseCommandName(contextOf(command).profile, commandWords(rootOf(command)), IDENTITY.command)
  refuseOffline(command, "the amoCRM account")
  const origin = accountOrigin(String(settings.configured.host ?? ""))
  if (answers.method === "browser") {
    const { found } = await signInWithButton(command, origin, steps)
    return { ...found, keep: { account: `${found.account}:${found.user.id}` } }
  }
  const typed = secrets.token?.trim()
  if (typed) {
    const { who, signIn, account } = await checkedToken(command, origin, typed)
    const { env, profile, keyring, tokens } = contextOf(command)
    // A request prefers an integration's sign-in to the token, so it would hide the token just proven. The token is
    // saved first, as `session start` does: a save that fails leaves the integration's sign-in in place.
    tokens.write(profile, signIn)
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

const MEMBER = { field: "role", is: "member" } as const
const BROWSER = { field: "method", is: "browser" } as const
const OWN_DEALS = "amo <profile> users list\namo <profile> config set crm.amocrm:example.amocrm.ru.unassigned 7001"
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
      next: "role",
    },
    role: {
      title: "role.title",
      blocks: [
        { type: "text", text: "role.intro" },
        {
          type: "choice",
          id: "role",
          optional: true,
          options: [
            { value: "admin", label: "role.admin", hint: "role.admin.hint" },
            { value: "member", label: "role.member", hint: "role.member.hint" },
          ],
        },
      ],
      next: [{ when: MEMBER, to: "ask-admin" }, { to: "method" }],
    },
    method: {
      title: "method.title",
      blocks: [
        { type: "text", text: "method.intro" },
        {
          type: "choice",
          id: "method",
          optional: true,
          options: [
            { value: "browser", label: "method.browser", hint: "method.browser.hint" },
            { value: "token", label: "method.token", hint: "method.token.hint" },
          ],
        },
      ],
      next: [{ when: BROWSER, to: "connect" }, { to: "integration" }],
    },
    connect: {
      kind: "run",
      title: "connect.title",
      action: "apply",
      blocks: [
        { type: "text", text: "connect.body" },
        { type: "note", role: "warning", text: "connect.admin" },
      ],
      next: [
        { when: { result: "connect", is: "ok" }, to: "done" },
        { when: { result: "connect", error: "conflict" }, to: "account" },
        { when: { result: "connect", error: "authentication_error" }, to: "method" },
        { when: { result: "connect", error: "validation_error" }, to: "method" },
        { when: { result: "connect", error: "timeout" }, to: "method" },
        { to: "failed" },
      ],
      back: false,
    },
    "ask-admin": {
      title: "ask.title",
      blocks: [
        { type: "text", text: "ask.body" },
        { type: "note", role: "warning", text: "ask.rights" },
        { type: "text", text: "ask.later" },
      ],
      next: "token",
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
        { type: "text", text: "token.where", when: { not: MEMBER } },
        { type: "text", text: "token.member", when: MEMBER },
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
        { type: "text", text: "done.own", when: MEMBER },
        { type: "code", code: OWN_DEALS, copy: true, when: MEMBER },
        { type: "text", text: "done.body" },
        { type: "code", code: "amo <profile> sync\namo <profile> deals list status:open", copy: true },
        {
          type: "group",
          when: { all: [{ not: MEMBER }, { not: BROWSER }] },
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
