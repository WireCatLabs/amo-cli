import type { SchemaNode } from "@wirecat/cli-base/codegen"
import type { SpecOperation } from "./operation.js"

/*
 * What amoCRM documents but the merged Kommo OpenAPI (contracts/kommo-openapi.json) does not carry as a concrete path
 * or value. Each entry names its page; nothing passes the fake or `api call` without being here or in the spec.
 */

const LINKS = "https://www.amocrm.ru/developers/content/crm_platform/entity-links-api"

/** The record types `{entity_type}` and `{entity}` take where the spec gives no enum. */
export const ENTITY_TYPES = {
  values: ["leads", "contacts", "companies", "customers"],
  sources: [
    LINKS,
    "https://www.amocrm.ru/developers/content/crm_platform/custom-fields",
    "https://www.amocrm.ru/developers/content/crm_platform/tags-api",
    "https://www.amocrm.ru/developers/content/crm_platform/events-and-notes",
  ],
} as const

/** Routes with no page in the Kommo reference. */
export const EXTRA_OPERATIONS: readonly SpecOperation[] = [
  {
    // The mass form beside the spec's `/{entity}/{entity_id}/links`: the links of many records in one call.
    name: "GET /api/v4/{entity_type}/links",
    effect: "read",
    summary: "Get the links of many entities",
    source: LINKS,
    path: { entity_type: { type: "string" } },
    query: ["filter[entity_id][]", "filter[to_entity_id]", "filter[to_entity_type]", "filter[to_catalog_id]"],
    body: false,
  },
]

/** The `with` values each list or record takes; the spec types `with` as free text and names them only in prose. */
export const WITH_VALUES: Readonly<Record<string, { values: readonly string[]; source: string }>> = Object.fromEntries(
  (
    [
      [
        ["GET /api/v4/account"],
        "amojo_id,version,drive_url,task_types,users_groups,datetime_settings,entity_names,is_api_filter_enabled",
        "https://www.amocrm.ru/developers/content/crm_platform/account-info",
      ],
      [
        ["GET /api/v4/leads", "GET /api/v4/leads/{id}"],
        "catalog_elements,is_price_modified_by_robot,loss_reason,contacts,only_deleted,source_id,source",
        "https://www.amocrm.ru/developers/content/crm_platform/leads-api",
      ],
      [
        ["GET /api/v4/contacts", "GET /api/v4/contacts/{id}"],
        "catalog_elements,leads,customers",
        "https://www.amocrm.ru/developers/content/crm_platform/contacts-api",
      ],
      [
        ["GET /api/v4/companies", "GET /api/v4/companies/{id}"],
        "catalog_elements,leads,customers,contacts",
        "https://www.amocrm.ru/developers/content/crm_platform/companies-api",
      ],
      [
        ["GET /api/v4/events"],
        "contact_name,lead_name,company_name,catalog_element_name,customer_name,catalog_name",
        "https://www.amocrm.ru/developers/content/crm_platform/events-and-notes",
      ],
      [
        ["GET /api/v4/users", "GET /api/v4/users/{id}"],
        "role,group,uuid,amojo_id,user_rank,phone_number",
        "https://www.amocrm.ru/developers/content/crm_platform/users-api",
      ],
    ] as const
  ).flatMap(([names, values, source]) => names.map((name) => [name, { values: values.split(","), source }])),
)

/** The largest `limit` a list takes: 250 on every list page, events 100 in the ru docs (Kommo says 250). */
export const LIMITS = {
  default: 250,
  byPath: { "/api/v4/events": 100 } as Readonly<Record<string, number>>,
  sources: [
    "https://www.amocrm.ru/developers/content/crm_platform/leads-api",
    "https://www.amocrm.ru/developers/content/crm_platform/events-and-notes",
  ],
} as const

const CUSTOM_FIELDS = "https://www.amocrm.ru/developers/content/crm_platform/custom-fields"

/**
 * Body fields the merged spec types wrongly, by name at any depth of any body: right for `custom_fields_values`, which
 * means the same everywhere. Every write page types
 * `custom_fields_values` as a string; the custom-fields page sends an array of `field_id` or `field_code` with
 * `values`, each a `value`, `enum_id` or `enum_code`.
 */
export const BODY_FIELDS: Readonly<Record<string, { schema: SchemaNode; source: string }>> = {
  custom_fields_values: {
    source: CUSTOM_FIELDS,
    schema: {
      type: "array",
      items: {
        type: "object",
        required: ["values"],
        properties: {
          field_id: { type: "integer" },
          field_code: { type: "string" },
          values: {
            type: "array",
            items: {
              type: "object",
              required: [],
              properties: {
                value: { type: "unknown" },
                enum_id: { type: "integer" },
                enum_code: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
}
