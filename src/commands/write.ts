import { CliError } from "@wirecat/cli-base"
import {
  environmentOf,
  itemOf,
  outputFor,
  readOnlyLockOf,
  readOnlyRefusal,
  renderAnswer,
  terminalAsker,
} from "@wirecat/cli-core/cli"
import { guardedWrite, guardFor, keyedGuard, type Level, levelFor, newOperationId } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import type { AmoTransport } from "../amo/transport.js"
import { permissions } from "../config.js"
import { contextOf, signInOf, transportFor } from "../context.js"
import { IDENTITY } from "../identity.js"

export interface Write {
  key: string
  /** Keys checked beside `key`, such as the command key a raw `api call` does the same as. */
  extra?: readonly string[]
  /** The built-in levels, when the call adds its own key's. */
  defaults?: Readonly<Record<string, Level>>
  act: (account: AmoTransport, operationId: string) => Promise<Record<string, unknown>>
}

/**
 * Every write's one path, as b24's and gcal-cli's: the read-only lock, the profile's levels, one question for every
 * key at `ask`, the send journal, and an `operation_id` in the answer (WC-PERM-13, WC-OUT-10).
 */
export const write = async (command: Command, { key, extra = [], defaults = permissions.defaults, act }: Write) => {
  const { env, settings, run } = contextOf(command)
  const lock = readOnlyLockOf(IDENTITY, env)
  if (lock) throw readOnlyRefusal(lock, "change the amoCRM account")
  const operationId = newOperationId()
  const levelOf = (one: string) => levelFor(settings.permissions, one, defaults).level
  const guard = keyedGuard(
    (ask) =>
      guardFor(
        IDENTITY,
        // amoCRM limits its own rate; the guard is here for the levels and the journal, not a send limit.
        { ...settings, sendsPerHour: Number.MAX_SAFE_INTEGER, permissionDefaults: defaults },
        outputFor(command).renderer.warn,
        environmentOf(command).env ?? process.env,
        ask,
      ),
    terminalAsker(command),
    levelOf,
    extra,
  )
  const request = { chatId: null, kind: "edit" as const, key, operationId }
  guard.refuse(request)
  const signIn = signInOf(command)
  let done: Record<string, unknown>
  try {
    done = await guardedWrite(guard, request, () =>
      run((events) => act(transportFor(command, signIn, events), operationId)),
    )
  } catch (error) {
    if (error instanceof CliError && error.code === "outcome_unknown")
      throw new CliError(
        "outcome_unknown",
        `${error.message} — check the account before you write it again: amoCRM has no idempotency key and would make it a second time`,
        { ...error.details, operation_id: operationId },
      )
    throw error
  }
  renderAnswer(command, outputFor(command), itemOf({ operation_id: operationId, ...done }))
}
