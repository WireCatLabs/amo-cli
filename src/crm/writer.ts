import { CliError, isCliError } from "@wirecat/cli-base"
import type { CrmField, CrmKind, CrmRecords } from "@wirecat/cli-core"
import {
  type CrmFields,
  type CrmOrganizationFields,
  type CrmPersonFields,
  type CrmWriteCapabilities,
  type CrmWriteOptions,
  type CrmWriter,
  crmValues,
  fieldNamed,
  foldFieldName,
  optionOf,
} from "@wirecat/cli-core/crm"
import { type AmoKind, ENTITIES } from "../amo/routes.js"
import type { AmoTransport } from "../amo/transport.js"
import { LOST, type Raw, WON } from "./records.js"
import type { AmoCrmSource } from "./source.js"

/**
 * amoCRM's API v4 has no call that deletes a lead (the Kommo reference lists create, update and complex only), so
 * `deals delete` is not offered. No write carries an idempotency key: `request_id` is echoed, not stored (companies-api).
 */
export const AMO_WRITES: CrmWriteCapabilities = {
  kinds: ["deal", "person", "organization"],
  verbs: ["create", "update", "move", "close"],
  idempotent: false,
}

/** A lead's, contact's and company's own fields (leads-api, contacts-api, companies-api): never set through --field. */
const STANDARD = new Set(
  [
    "id",
    "name",
    "first_name",
    "last_name",
    "price",
    "status_id",
    "pipeline_id",
    "responsible_user_id",
    "loss_reason_id",
    "closed_at",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at",
  ].map(foldFieldName),
)

const refused = (message: string, param?: string) =>
  new CliError("validation_error", message, { reason: "crm.record-field", sent: false, ...(param ? { param } : {}) })

const numericId = (value: string, param: string) => {
  if (!/^\d{1,20}$/.test(value)) throw refused(`${param} takes amoCRM's numeric id`, param)
  return Number(value)
}

type Custom = NonNullable<CrmFields["custom"]>

/** custom-fields: `[{field_id, values: [{value} | {enum_id}]}]`; an empty `values` clears the field. */
const customValuesOf = (defined: readonly CrmField[], custom: Custom) =>
  Object.entries(custom).map(([name, value]) => {
    const field = fieldNamed(defined, name, "--field")
    if (field.holds) throw refused(`${field.label ?? field.code} holds phones or e-mails; amo does not set them here`)
    const one = (given: string) =>
      field.options ? { enum_id: Number(optionOf(field, given, "--field")) } : { value: given }
    const values = value === null ? [] : (Array.isArray(value) ? value : [value]).map(one)
    return { field_id: Number(field.code), values }
  })

const refuseStandard = (custom: Custom | undefined) => {
  for (const code of Object.keys(custom ?? {}))
    if (STANDARD.has(foldFieldName(code)))
      throw refused(`${code} is one of amoCRM's own fields; set it with its own option, not --field`, "--field")
}

/**
 * Core's write port over API v4: a mass PATCH or POST of one record (leads-api), sent once (the transport retries a
 * write only on a refused rate), then the record read back whole, as core's store wants it.
 */
export const amoCrmWriter = (account: () => AmoTransport, source: AmoCrmSource): CrmWriter => {
  const dealOf = async (given: CrmFields, create: boolean): Promise<Raw> => {
    refuseStandard(given.custom)
    if (given.people !== undefined) throw refused("amo does not set the contacts on a deal yet")
    if (given.owner === null) throw refused("an amoCRM deal is always assigned to a user", "--owner")
    if (given.closeDate !== undefined) throw refused("amoCRM deals have no expected close date", "--close-date")
    if (given.organization !== undefined && (!create || given.organization === null))
      throw refused("amo sets a deal's company only when it creates the deal", "--organization")
    if (given.currency != null) {
      const { currency } = await source.account()
      if (given.currency !== currency)
        throw refused(`amoCRM keeps every amount in the account's currency, ${currency ?? "none set"}`, "--currency")
    }
    const fields: Raw = {}
    if (given.title !== undefined) fields.name = given.title
    if (given.pipeline !== undefined) fields.pipeline_id = numericId(given.pipeline, "--pipeline")
    if (given.stage !== undefined) fields.status_id = numericId(given.stage, "--stage")
    if (given.amount !== undefined) fields.price = given.amount === null ? 0 : Number(given.amount)
    if (given.owner != null) fields.responsible_user_id = numericId(given.owner, "--owner")
    if (given.organization) fields._embedded = { companies: [{ id: numericId(given.organization, "--organization") }] }
    if (given.custom && Object.keys(given.custom).length)
      fields.custom_fields_values = customValuesOf(await source.fields("deal"), given.custom)
    return fields
  }

  /**
   * A contact made through the API or a web form may hold only `name`. It is split in the order `fullName` joins the
   * parts, so a contact renamed by one part keeps the other.
   */
  const partsOf = (
    current: { name?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined,
  ) => {
    if (current?.firstName || current?.lastName) return { first: current.firstName, last: current.lastName }
    const [first, ...rest] = (current?.name ?? "").trim().split(/\s+/)
    return { first: first || undefined, last: rest.join(" ") || undefined }
  }

  /** On update the contact as amoCRM holds it now: the name part not given, and the kinds of the numbers kept. */
  const personOf = async (given: CrmPersonFields, externalId?: string): Promise<Raw> => {
    refuseStandard(given.custom)
    if (given.owner === null) throw refused("an amoCRM contact is always assigned to a user", "--owner")
    if (given.position !== undefined)
      throw refused("amoCRM keeps a job title in an account's own field; set it with --field", "--position")
    const naming = given.name === undefined && (given.firstName !== undefined || given.lastName !== undefined)
    const current =
      externalId !== undefined && (naming || given.emails || given.phones)
        ? await source.get?.("person", externalId)
        : undefined
    const fields: Raw = {}
    const stored = partsOf(current)
    const name =
      given.name ??
      (naming
        ? crmValues.fullName(
            given.firstName === undefined ? stored.first : given.firstName,
            given.lastName === undefined ? stored.last : given.lastName,
          )
        : undefined)
    if (name != null) fields.name = name
    if (given.firstName !== undefined) fields.first_name = given.firstName ?? ""
    if (given.lastName !== undefined) fields.last_name = given.lastName ?? ""
    if (given.owner != null) fields.responsible_user_id = numericId(given.owner, "--owner")
    const values = await valuesOf("person", given, current?.contactTypes)
    if (values.length) fields.custom_fields_values = values
    return fields
  }

  /** The custom values, and each list of phones or e-mails in the field that holds it, replacing the whole list. */
  const valuesOf = async (
    kind: "person" | "organization",
    given: CrmPersonFields | CrmOrganizationFields,
    kinds: Record<string, string> = {},
  ) => {
    if (!given.emails && !given.phones && !(given.custom && Object.keys(given.custom).length)) return []
    const defined = await source.fields(kind)
    const values = given.custom ? customValuesOf(defined, given.custom) : []
    for (const [holds, list] of [
      ["email", given.emails],
      ["phone", given.phones],
    ] as const) {
      if (list === undefined) continue
      const field = defined.find((one) => one.holds === holds)
      if (!field) throw refused(`this account has no ${holds} field on ${kind === "person" ? "contacts" : "companies"}`)
      // A number kept keeps its kind (MOB, HOME…); a new one is WORK, as contacts-api's PATCH example sends it.
      values.push({
        field_id: Number(field.code),
        values: list.map((value) => ({ value, enum_code: kinds[value] ?? "WORK" })) as never,
      })
    }
    return values
  }

  const organizationOf = async (given: CrmOrganizationFields): Promise<Raw> => {
    refuseStandard(given.custom)
    if (given.owner === null) throw refused("an amoCRM company is always assigned to a user", "--owner")
    const fields: Raw = {}
    if (given.name !== undefined) fields.name = given.name
    if (given.owner != null) fields.responsible_user_id = numericId(given.owner, "--owner")
    const values = await valuesOf("organization", given)
    if (values.length) fields.custom_fields_values = values
    return fields
  }

  const bodyOf = (kind: CrmKind, given: unknown, create: boolean, externalId?: string): Promise<Raw> => {
    if (kind === "deal") return dealOf(given as CrmFields, create)
    if (kind === "person") return personOf(given as CrmPersonFields, create ? undefined : externalId)
    if (kind === "organization") return organizationOf(given as CrmOrganizationFields)
    throw new CliError("validation_error", "amoCRM has no leads apart from its deals", {
      reason: "crm.write-unsupported",
    })
  }

  /** The write went through: a failed read-back must never read as a failed write, or the owner repeats it. */
  const readBack = async <K extends CrmKind>(kind: K, externalId: string, options: CrmWriteOptions) => {
    try {
      const found = kind === "deal" ? await source.item(externalId) : await source.get?.(kind as "person", externalId)
      if (!found) throw new CliError("not_found", `amoCRM has no ${kind} ${externalId}`)
      return found as CrmRecords[K]
    } catch (error) {
      throw new CliError(
        "invalid_response",
        `amoCRM made the change to ${kind} ${externalId}, but reading it back failed` +
          `${isCliError(error) ? ` (${error.code})` : ""}; run sync to store it — do not write it again`,
        { operation_id: options.operationId, external_id: externalId, sent: true },
      )
    }
  }

  const update = async <K extends CrmKind>(kind: K, externalId: string, fields: Raw, options: CrmWriteOptions) => {
    if (Object.keys(fields).length === 0) throw refused("nothing to change: name a field")
    const entity = ENTITIES[kind as AmoKind]
    await account().request({ route: entity.update, body: [{ id: Number(externalId), ...fields }] })
    return readBack(kind, externalId, options)
  }

  const stageOf = async (externalId: string) => {
    const current = await source.item(externalId)
    return { current, pipeline: Number(current.pipeline) }
  }

  return {
    provider: "amocrm",
    capabilities: AMO_WRITES,
    async create(kind, draft, options) {
      const fields = await bodyOf(kind, draft, true)
      const entity = ENTITIES[kind as AmoKind]
      const { body } = await account().request({ route: entity.create, body: [fields] })
      const created = crmValues.rawsOf(crmValues.fieldOf(crmValues.fieldOf(body, "_embedded"), entity.name))[0]
      const externalId = crmValues.id(created?.id)
      if (externalId === null)
        throw new CliError(
          "invalid_response",
          `amoCRM answered the new ${kind} without its id; run sync before writing again`,
          {
            operation_id: options.operationId,
            sent: true,
          },
        )
      return readBack(kind, externalId, options)
    },
    async update(kind, externalId, patch, options) {
      return update(kind, externalId, await bodyOf(kind, patch, false, externalId), options)
    },
    async move(_kind, externalId, stage, options) {
      const { pipeline } = await stageOf(externalId)
      return update("deal", externalId, { status_id: numericId(stage, "<stage>"), pipeline_id: pipeline }, options)
    },
    // 142 won and 143 lost in every pipeline (leads_pipelines); a lost one takes a loss reason by name (loss-reasons).
    async close(_kind, externalId, outcome, options) {
      const { pipeline } = await stageOf(externalId)
      const fields: Raw = { status_id: Number(outcome === "won" ? WON : LOST), pipeline_id: pipeline }
      if (options.reason !== undefined) {
        if (outcome === "won")
          throw refused("amoCRM keeps a reason only on a lost deal; leave out --reason", "--reason")
        const reasons = await source.lossReasons()
        const want = foldFieldName(options.reason)
        const found = reasons.find((one) => one.id === options.reason || foldFieldName(one.name) === want)
        if (!found)
          throw refused(
            `amoCRM has no loss reason ${options.reason}; it has ${reasons.map((one) => one.name).join(", ") || "none"}`,
            "--reason",
          )
        fields.loss_reason_id = Number(found.id)
      }
      return update("deal", externalId, fields, options)
    },
    async remove() {
      throw new CliError("validation_error", "amoCRM's API has no call that deletes a deal; delete it in amoCRM", {
        reason: "crm.write-unsupported",
        sent: false,
      })
    },
  }
}
