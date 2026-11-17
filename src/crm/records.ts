import type { CrmField, CrmItem, CrmOrganization, CrmPerson, CrmPipeline, CrmUser, CrmValue } from "@wirecat/cli-core"
import { crmValues } from "@wirecat/cli-core/crm"

const { amountOf, epoch, fieldOf, id, isRaw, rawsOf, text } = crmValues

export type Raw = crmValues.CrmRaw

/** Every pipeline has these two, whatever their names (leads_pipelines). */
export const WON = "142"
export const LOST = "143"

/** The list fields: a value is an option's `enum_id` (custom-fields). */
const LISTS = new Set(["select", "multiselect", "radiobutton"])
const MULTIPLE = new Set(["multiselect", "multitext"])
/** A contact's or company's phones and e-mails: `multitext` with code `PHONE` or `EMAIL` (contacts-api, custom-fields). */
const HOLDS: Record<string, CrmField["holds"]> = { PHONE: "phone", EMAIL: "email" }

const holdsOf = (raw: Raw) => (raw.type === "multitext" ? HOLDS[String(raw.code ?? raw.field_code ?? "")] : undefined)

/** amoCRM's field definition; its `code` is often null, so the port's code is the field's id. */
export const fieldOfRaw = (raw: Raw): CrmField | null => {
  const code = id(raw.id)
  const type = text(raw.type)
  if (!code || !type) return null
  const options = LISTS.has(type)
    ? rawsOf(raw.enums).flatMap((one) => {
        const option = id(one.id)
        return option ? [{ id: option, label: text(one.value) ?? option }] : []
      })
    : undefined
  const holds = holdsOf(raw)
  return {
    code,
    label: text(raw.name),
    type,
    multiple: MULTIPLE.has(type),
    // Filtering by a custom field is the paid add-on's `filter[custom_fields_values]` (filters-api); amo does not ask it.
    filterable: false,
    ...(options ? { options } : {}),
    ...(holds ? { holds } : {}),
  }
}

/** `custom_fields_values` split: phones and e-mails with their `enum_code` kind, the rest by field id. */
const valuesOf = (raw: Raw) => {
  const phones: string[] = []
  const emails: string[] = []
  const contactTypes: Record<string, string> = {}
  const custom: Record<string, unknown> = {}
  for (const field of rawsOf(raw.custom_fields_values)) {
    const code = id(field.field_id)
    const values = rawsOf(field.values)
    const holds = holdsOf({ type: field.field_type, code: field.field_code })
    if (holds) {
      for (const one of values) {
        const value = text(one.value)
        if (!value) continue
        ;(holds === "phone" ? phones : emails).push(value)
        const kind = text(one.enum_code)
        if (kind) contactTypes[value] = kind
      }
      continue
    }
    if (!code) continue
    const list = LISTS.has(String(field.field_type))
    const read = values.map((one) => (list ? id(one.enum_id) : one.value)).filter((one) => one !== null)
    custom[code] = MULTIPLE.has(String(field.field_type)) ? read : (read[0] ?? null)
  }
  return { phones, emails, contactTypes, custom }
}

const metadataOf = (custom: Record<string, unknown>, fields: readonly CrmField[]) =>
  Object.keys(custom).length ? { metadata: crmValues.crmValuesOf(custom, fields) as Record<string, CrmValue> } : {}

const embedded = (raw: Raw, key: string) => rawsOf(fieldOf(raw._embedded, key))

/** The day a time falls on in the account's time zone (account-info `datetime_settings`), else in UTC. */
const day = (at: unknown, timeZone: string | null) => {
  const ms = epoch(at)
  if (ms === null) return null
  try {
    if (timeZone) return new Intl.DateTimeFormat("en-CA", { timeZone }).format(ms)
  } catch {}
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * A lead (leads-api): its stage is `status_id` in `pipeline_id`; amoCRM keeps no currency on a lead, so the amount is
 * in the account's `currency` (account-info). `closed_at` is a time, kept as its day in the account's time zone.
 */
export const toDeal = (
  raw: Raw,
  fields: readonly CrmField[],
  currency: string | null,
  timeZone: string | null = null,
): CrmItem => {
  const { custom } = valuesOf(raw)
  const contacts = fieldOf(raw._embedded, "contacts")
  const stage = id(raw.status_id) ?? ""
  return {
    externalId: id(raw.id) ?? "",
    title: text(raw.name) ?? "",
    pipeline: id(raw.pipeline_id) ?? "",
    stage,
    ...amountOf(raw.price, currency),
    closedDate: stage === WON || stage === LOST ? day(raw.closed_at, timeZone) : null,
    closedReason: stage === LOST ? text(embedded(raw, "loss_reason")[0]?.name) : null,
    organization: id(embedded(raw, "companies")[0]?.id),
    // `with=contacts` lists them with `is_main`; without it amoCRM did not say, and the stored ones stay.
    ...(Array.isArray(contacts)
      ? {
          people: rawsOf(contacts).flatMap((one) => {
            const externalId = id(one.id)
            return externalId ? [{ externalId, role: "contact" as const, primary: one.is_main === true }] : []
          }),
        }
      : {}),
    createdAt: epoch(raw.created_at),
    updatedAt: epoch(raw.updated_at),
    assignee: id(raw.responsible_user_id),
    ...metadataOf(custom, fields),
  }
}

export const toPerson = (raw: Raw, fields: readonly CrmField[]): CrmPerson => {
  const { phones, emails, contactTypes, custom } = valuesOf(raw)
  return {
    externalId: id(raw.id) ?? "",
    name: text(raw.name),
    firstName: text(raw.first_name),
    lastName: text(raw.last_name),
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
    phones,
    emails,
    ...(Object.keys(contactTypes).length ? { contactTypes } : {}),
    organizations: embedded(raw, "companies").flatMap((one, at) => {
      const externalId = id(one.id)
      return externalId ? [{ externalId, primary: at === 0 }] : []
    }),
    assignee: id(raw.responsible_user_id),
    createdAt: epoch(raw.created_at),
    updatedAt: epoch(raw.updated_at),
    ...metadataOf(custom, fields),
  }
}

export const toOrganization = (raw: Raw, fields: readonly CrmField[]): CrmOrganization => {
  const { phones, emails, contactTypes, custom } = valuesOf(raw)
  const people = fieldOf(raw._embedded, "contacts")
  return {
    externalId: id(raw.id) ?? "",
    name: text(raw.name) ?? "",
    ...(phones.length ? { phones } : {}),
    ...(emails.length ? { emails } : {}),
    ...(Object.keys(contactTypes).length ? { contactTypes } : {}),
    ...(Array.isArray(people) ? { people: rawsOf(people).flatMap((one) => id(one.id) ?? []) } : {}),
    assignee: id(raw.responsible_user_id),
    createdAt: epoch(raw.created_at),
    updatedAt: epoch(raw.updated_at),
    ...metadataOf(custom, fields),
  }
}

/** users-api: `rights.is_active`; amoCRM names no job title or department on a user. */
export const toUser = (raw: Raw): CrmUser | null => {
  const externalId = id(raw.id)
  if (!externalId) return null
  const rights = isRaw(raw.rights) ? raw.rights : {}
  return { externalId, name: text(raw.name), email: text(raw.email), active: rights.is_active !== false }
}

/** leads_pipelines: `_embedded.statuses`, 142 won and 143 lost in every pipeline, the rest open (unsorted, type 1, too). */
export const toPipeline = (raw: Raw): CrmPipeline | null => {
  const externalId = id(raw.id)
  if (!externalId) return null
  return {
    externalId,
    name: text(raw.name) ?? externalId,
    stages: embedded(raw, "statuses").flatMap((one) => {
      const stage = id(one.id)
      if (!stage) return []
      const outcome = stage === WON ? "won" : stage === LOST ? "lost" : "open"
      return [{ externalId: stage, name: text(one.name) ?? stage, position: Number(one.sort) || 0, outcome } as const]
    }),
  }
}
