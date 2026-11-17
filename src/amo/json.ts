import { crmValues } from "@wirecat/cli-core/crm"

export type Json = Record<string, unknown>

export const isRecord: (value: unknown) => value is Json = crmValues.isRaw
