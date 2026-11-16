// GENERATED. DO NOT EDIT.
// Source: contracts/kommo-openapi.json
// Run: pnpm kommo:operations

import type { SchemaNode } from "@wirecat/cli-base/codegen"

export interface KommoSchema {
  query: Readonly<Record<string, SchemaNode>>
  body?: SchemaNode
}

export const KOMMO_SCHEMAS: Readonly<Record<string, KommoSchema>> = {
  "DELETE /api/v4/{entity_type}/custom_fields/groups/{id}": { query: {} },
  "DELETE /api/v4/{entity}/{entity_id}/files": {
    query: {},
    body: { type: "array", items: { type: "object", properties: { file_uuid: { type: "string" } }, required: [] } },
  },
  "DELETE /api/v4/{entity}/custom_fields/{id}": { query: {} },
  "DELETE /api/v4/chats/templates": {
    query: {},
    body: {
      type: "array",
      items: { type: "object", properties: { id: { type: "integer", format: "int32" } }, required: [] },
    },
  },
  "DELETE /api/v4/chats/templates/{id}": { query: {} },
  "DELETE /api/v4/leads/pipelines/{id}": { query: {} },
  "DELETE /api/v4/leads/pipelines/{pipeline_id}/statuses/{id}": { query: {} },
  "DELETE /api/v4/leads/unsorted/{uid}/decline": {
    query: {},
    body: { type: "object", properties: { user_id: { type: "integer", format: "int32" } }, required: [] },
  },
  "DELETE /api/v4/roles/{id}": { query: {} },
  "DELETE /api/v4/sources": {
    query: {},
    body: {
      type: "array",
      items: { type: "object", properties: { id: { type: "integer", format: "int32" } }, required: [] },
    },
  },
  "DELETE /api/v4/sources/{id}": { query: {} },
  "DELETE /api/v4/webhooks": {
    query: {},
    body: { type: "object", properties: { destination: { type: "string" } }, required: [] },
  },
  "DELETE /api/v4/widgets/{widget_code}": { query: {} },
  "GET /api/v4/{entity_type}/{entity_id}/notes": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "filter[id][]": { type: "array", items: { type: "string" } },
      "filter[note_type][]": { type: "array", items: { type: "string" } },
      "filter[updated_at][from]": { type: "integer", format: "int32" },
      "filter[updated_at][to]": { type: "integer", format: "int32" },
      "order[updated_at]": { type: "string", enum: ["asc", "desc"] },
      "order[id]": { type: "string", enum: ["asc", "desc"] },
      with: { type: "string", enum: ["is_pinned"] },
    },
  },
  "GET /api/v4/{entity_type}/custom_fields": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "order[sort]": { type: "string", enum: ["asc", "desc"] },
      "order[id]": { type: "string", enum: ["asc", "desc"] },
      "filter[type][0]": {
        type: "string",
        enum: [
          "text",
          "numeric",
          "checkbox",
          "select",
          "multiselect",
          "date",
          "url",
          "textarea",
          "radiobutton",
          "streetaddress",
          "smart_address",
          "birthday",
          "date_time",
          "legal_entity",
          "price",
          "category",
          "items",
        ],
      },
    },
  },
  "GET /api/v4/{entity_type}/custom_fields/{id}": { query: {} },
  "GET /api/v4/{entity_type}/custom_fields/groups": { query: {} },
  "GET /api/v4/{entity_type}/custom_fields/groups/{id}": { query: {} },
  "GET /api/v4/{entity_type}/notes": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "filter[id][]": { type: "array", items: { type: "string" } },
      "filter[note_type][]": { type: "array", items: { type: "string" } },
      "filter[updated_at][from]": { type: "integer", format: "int32" },
      "filter[updated_at][to]": { type: "integer", format: "int32" },
      "order[updated_at]": { type: "string", enum: ["asc", "desc"] },
      "order[id]": { type: "string", enum: ["asc", "desc"] },
      with: { type: "string" },
    },
  },
  "GET /api/v4/{entity_type}/notes/{id}": { query: {} },
  "GET /api/v4/{entity_type}/tags": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      query: { type: "string" },
      "filter[id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[name]": { type: "string" },
    },
  },
  "GET /api/v4/{entity}/{entity_id}/files": {
    query: { limit: { type: "integer", format: "int32" }, before_id: { type: "integer", format: "int32" } },
  },
  "GET /api/v4/{entity}/{entity_id}/links": {
    query: {
      "filter[to_entity_id]": { type: "integer", format: "int32" },
      "filter[to_entity_type]": { type: "string" },
      "filter[to_catalog_id]": { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/account": { query: { with: { type: "string" } } },
  "GET /api/v4/bots": {
    query: {
      page: { type: "integer" },
      limit: { type: "integer" },
      "filter[type_functionality][]": { type: "array", items: { type: "string" } },
      "filter[id][]": { type: "array", items: { type: "integer", format: "int32" } },
      with: { type: "string" },
    },
  },
  "GET /api/v4/bots/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/catalogs": {
    query: { page: { type: "integer", format: "int32" }, limit: { type: "integer", format: "int32" } },
  },
  "GET /api/v4/catalogs/{id}": { query: {} },
  "GET /api/v4/catalogs/{list_id}/custom_fields": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "order[sort]": { type: "string", enum: ["asc", "desc"] },
      "order[id]": { type: "string", enum: ["asc", "desc"] },
      "filter[type][0]": {
        type: "string",
        enum: [
          "text",
          "numeric",
          "checkbox",
          "select",
          "multiselect",
          "date",
          "url",
          "textarea",
          "radiobutton",
          "streetaddress",
          "smart_address",
          "birthday",
          "date_time",
          "legal_entity",
          "price",
          "category",
          "items",
        ],
      },
    },
  },
  "GET /api/v4/catalogs/{list_id}/custom_fields/{custom_field_id}": { query: {} },
  "GET /api/v4/catalogs/{list_id}/elements": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      query: { type: "string" },
      "filter[id][]": { type: "array", items: { type: "integer", format: "int32" } },
    },
  },
  "GET /api/v4/catalogs/{list_id}/elements/{element_id}": { query: {} },
  "GET /api/v4/chats/templates": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "filter[external_id]": { type: "array", items: { type: "string" } },
      with: { type: "string" },
    },
  },
  "GET /api/v4/chats/templates/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/companies": {
    query: {
      with: { type: "string" },
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      query: { type: "string" },
      "order[updated_at]": { type: "string", enum: ["asc", "desc"] },
      "order[id]": { type: "string", enum: ["asc", "desc"] },
      "filter[id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[name][]": { type: "array", items: { type: "string" } },
      "filter[created_by][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[updated_by][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[responsible_user_id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[created_at][from]": { type: "integer", format: "int32" },
      "filter[created_at][to]": { type: "integer", format: "int32" },
      "filter[updated_at][from]": { type: "integer", format: "int32" },
      "filter[updated_at][to]": { type: "integer", format: "int32" },
      "filter[closest_task_at][from]": { type: "integer", format: "int32" },
      "filter[closest_task_at][to]": { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/companies/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/contacts": {
    query: {
      with: { type: "string" },
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      query: { type: "string" },
      "order[updated_at]": { type: "string", enum: ["asc", "desc"] },
      "order[id]": { type: "string", enum: ["asc", "desc"] },
      "filter[id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[name][]": { type: "array", items: { type: "string" } },
      "filter[created_by][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[updated_by][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[responsible_user_id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[updated_at][from]": { type: "integer", format: "int32" },
      "filter[updated_at][to]": { type: "integer", format: "int32" },
      "filter[closest_task_at][from]": { type: "integer", format: "int32" },
      "filter[closest_task_at][to]": { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/contacts/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/contacts/chats": {
    query: { contact_id: { type: "integer", format: "int32" }, chat_id: { type: "string" } },
  },
  "GET /api/v4/events": {
    query: {
      with: { type: "string" },
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "filter[id]": { type: "string" },
      "filter[created_at][from]": { type: "integer", format: "int32" },
      "filter[created_at][to]": { type: "integer", format: "int32" },
      "filter[created_by]": { type: "string" },
      "filter[entity]": { type: "string" },
      "filter[entity_id]": { type: "string" },
      "filter[type]": { type: "string" },
    },
  },
  "GET /api/v4/events/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/events/types": { query: { language_code: { type: "string" } } },
  "GET /api/v4/files/{file_uuid}/links": { query: {} },
  "GET /api/v4/leads": {
    query: {
      with: { type: "string" },
      page: { type: "integer", format: "int32" },
      limit: { type: "string" },
      query: { type: "string" },
      "order[created_at]": { type: "string", enum: ["asc", "desc"] },
      "order[updated_at]": { type: "string", enum: ["asc", "desc"] },
      "order[id]": { type: "string", enum: ["asc", "desc"] },
      "filter[id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[name][]": { type: "array", items: { type: "string" } },
      "filter[price]": { type: "integer", format: "int32" },
      "filter[created_by][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[updated_by][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[responsible_user_id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[created_at][from]": { type: "integer", format: "int32" },
      "filter[created_at][to]": { type: "integer", format: "int32" },
      "filter[updated_at][from]": { type: "integer", format: "int32" },
      "filter[updated_at][to]": { type: "integer", format: "int32" },
      "filter[closed_at][from]": { type: "integer", format: "int32" },
      "filter[closed_at][to]": { type: "integer", format: "int32" },
      "filter[closest_task_at][from]": { type: "integer", format: "int32" },
      "filter[closest_task_at][to]": { type: "integer", format: "int32" },
      "filter[pipeline_id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[statuses][0][pipeline_id]": { type: "integer", format: "int32" },
      "filter[statuses][0][status_id]": { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/leads/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/leads/{id}/subscriptions": { query: { page: { type: "integer" }, limit: { type: "integer" } } },
  "GET /api/v4/leads/loss_reasons": { query: {} },
  "GET /api/v4/leads/loss_reasons/{id}": { query: {} },
  "GET /api/v4/leads/pipelines": { query: {} },
  "GET /api/v4/leads/pipelines/{id}": { query: {} },
  "GET /api/v4/leads/pipelines/{pipeline_id}/statuses": { query: { with: { type: "string", enum: ["descriptions"] } } },
  "GET /api/v4/leads/pipelines/{pipeline_id}/statuses/{id}": {
    query: { with: { type: "string", enum: ["descriptions"] } },
  },
  "GET /api/v4/leads/unsorted": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "filter[uid]": { type: "array", items: { type: "string" } },
      "filter[category]": { type: "array", items: { type: "string" } },
      "filter[pipeline_id]": { type: "integer", format: "int32" },
      "order[created_at]": { type: "string" },
    },
  },
  "GET /api/v4/leads/unsorted/{uid}": { query: {} },
  "GET /api/v4/leads/unsorted/summary": {
    query: {
      "filter[uid]": { type: "array", items: { type: "string" } },
      "filter[created_at]": { type: "integer", format: "int32" },
      "filter[created_at][from]": { type: "integer", format: "int32" },
      "filter[created_at][to]": { type: "integer", format: "int32" },
      "filter[pipeline_id]": { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/roles": {
    query: {
      with: { type: "string" },
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/roles/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/sources": { query: { "filter[external_id]": { type: "array", items: { type: "string" } } } },
  "GET /api/v4/sources/{id}": { query: {} },
  "GET /api/v4/talks": {
    query: {
      page: { type: "integer" },
      limit: { type: "integer" },
      "filter[talk_id][]": { type: "array", items: { type: "integer" } },
      "filter[contact_id][]": { type: "array", items: { type: "integer" } },
      "filter[entity_id][]": { type: "array", items: { type: "integer" } },
      "filter[entity_type]": { type: "string", enum: ["lead"] },
      "filter[only_in_work]": { type: "string" },
    },
  },
  "GET /api/v4/talks/{id}": { query: {} },
  "GET /api/v4/talks/{talk_id}/messages": {
    query: {
      page: { type: "integer" },
      limit: { type: "integer" },
      "filter[created_at][from]": { type: "integer" },
      "filter[created_at][to]": { type: "integer" },
    },
  },
  "GET /api/v4/tasks": {
    query: {
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
      "filter[responsible_user_id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[is_completed]": { type: "integer", format: "int32" },
      "filter[task_type][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[entity_type]": { type: "string", enum: ["leads", "contacts", "companies"] },
      "filter[entity_id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[id][]": { type: "array", items: { type: "integer", format: "int32" } },
      "filter[updated_at]": { type: "integer", format: "int32" },
      "filter[updated_at][from]": { type: "integer", format: "int32" },
      "filter[updated_at][to]": { type: "integer", format: "int32" },
      "order[complete_till]": { type: "string" },
      "order[created_at]": { type: "string" },
      "order[id]": { type: "string" },
    },
  },
  "GET /api/v4/tasks/{id}": { query: {} },
  "GET /api/v4/users": {
    query: {
      with: { type: "string" },
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/users/{id}": { query: { with: { type: "string" } } },
  "GET /api/v4/webhooks": { query: { "filter[destination]": { type: "string" } } },
  "GET /api/v4/website_buttons": {
    query: {
      with: { type: "string", enum: ["scripts"] },
      page: { type: "integer", format: "int32" },
      limit: { type: "integer", format: "int32" },
    },
  },
  "GET /api/v4/website_buttons/{source_id}": { query: { with: { type: "string", enum: ["scripts"] } } },
  "GET /api/v4/widgets": {
    query: { page: { type: "integer", format: "int32" }, limit: { type: "integer", format: "int32" } },
  },
  "GET /api/v4/widgets/{widget_code}": { query: {} },
  "PATCH /api/v4/{entity_type}": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
            },
            required: [],
          },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/{entity_type}/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        _embedded: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                required: [],
              },
            },
          },
          required: [],
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/{entity_type}/custom_fields": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          code: { type: "string" },
          name: { type: "string" },
          sort: { type: "integer", format: "int32" },
          group_id: { type: "string" },
          is_api_only: { type: "boolean" },
          enums: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                value: { type: "string" },
                sort: { type: "string" },
                code: { type: "string" },
              },
              required: [],
            },
          },
          required_statuses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                status_id: { type: "integer", format: "int32" },
                pipeline_id: { type: "integer", format: "int32" },
              },
              required: [],
            },
          },
          remind: { type: "string" },
          tracking_callback: { type: "string" },
          hidden_statuses: {
            type: "array",
            items: {
              type: "object",
              properties: { status_id: { type: "integer" }, pipeline_id: { type: "integer" } },
              required: [],
            },
          },
          chained_lists: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                catalog_id: { type: "integer" },
                parent_catalog_id: { type: "integer" },
              },
              required: [],
            },
          },
          search_in: { type: "string" },
          currency: { type: "string" },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/{entity_type}/custom_fields/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        sort: { type: "integer", format: "int32" },
        group_id: { type: "string" },
        is_api_only: { type: "boolean" },
        required_statuses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              status_id: { type: "integer", format: "int32" },
              pipeline_id: { type: "integer", format: "int32" },
            },
            required: [],
          },
        },
        enums: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              value: { type: "string" },
              sort: { type: "integer", format: "int32" },
              code: { type: "string" },
            },
            required: [],
          },
        },
        remind: { type: "string" },
        tracking_callback: { type: "string" },
        hidden_statuses: {
          type: "array",
          items: {
            type: "object",
            properties: { status_id: { type: "integer" }, pipeline_id: { type: "integer" } },
            required: [],
          },
        },
        chained_lists: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              catalog_id: { type: "integer" },
              parent_catalog_id: { type: "integer" },
            },
            required: [],
          },
        },
        search_in: { type: "string" },
        currency: { type: "string" },
      },
      required: [],
    },
  },
  "PATCH /api/v4/{entity_type}/custom_fields/groups/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        sort: { type: "integer" },
        fields: { type: "array", items: { type: "integer" } },
      },
      required: [],
    },
  },
  "PATCH /api/v4/{entity_type}/notes": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          entity_id: { type: "integer", format: "int32" },
          note_type: { type: "string" },
          params: { type: "string" },
        },
        required: ["id", "entity_id"],
      },
    },
  },
  "PATCH /api/v4/{entity_type}/notes/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        entity_id: { type: "integer", format: "int32" },
        note_type: { type: "string" },
        params: { type: "string" },
      },
      required: [],
    },
  },
  "PATCH /api/v4/catalogs": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          can_link_multiple: { type: "boolean" },
          request_id: { type: "string" },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/catalogs/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        id: { type: "integer", format: "int32" },
        name: { type: "string" },
        can_link_multiple: { type: "boolean" },
        request_id: { type: "string" },
      },
      required: [],
    },
  },
  "PATCH /api/v4/catalogs/{id}/custom_fields": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          sort: { type: "integer", format: "int32" },
          settings: { type: "string" },
          is_visible: { type: "boolean" },
          is_required: { type: "boolean" },
          enums: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                value: { type: "string" },
                sort: { type: "integer", format: "int32" },
                code: { type: "string" },
              },
              required: [],
            },
          },
          nested: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer", format: "int32" },
                parent_id: { type: "integer", format: "int32" },
                value: { type: "string" },
                sort: { type: "integer", format: "int32" },
                request_id: { type: "string" },
                parent_request_id: { type: "string" },
              },
              required: [],
            },
          },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/catalogs/{list_id}/custom_fields/{cf_id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        id: { type: "integer", format: "int32" },
        name: { type: "string" },
        sort: { type: "integer", format: "int32" },
        settings: { type: "string" },
        is_visible: { type: "boolean" },
        is_required: { type: "boolean" },
        enums: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              value: { type: "string" },
              sort: { type: "integer", format: "int32" },
              code: { type: "string" },
            },
            required: [],
          },
        },
        nested: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", format: "int32" },
              parent_id: { type: "integer", format: "int32" },
              value: { type: "string" },
              sort: { type: "integer", format: "int32" },
              request_id: { type: "string" },
              parent_request_id: { type: "string" },
            },
            required: [],
          },
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/catalogs/{list_id}/elements": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          custom_fields_values: { type: "string" },
          request_id: { type: "string" },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/catalogs/{list_id}/elements/{element_id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        id: { type: "integer", format: "int32" },
        name: { type: "string" },
        custom_fields_values: { type: "string" },
        request_id: { type: "string" },
      },
      required: [],
    },
  },
  "PATCH /api/v4/chats/templates": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          content: { type: "string" },
          is_editable: { type: "boolean" },
          type: { type: "string" },
          buttons: {
            type: "array",
            items: {
              type: "object",
              properties: { type: { type: "string" }, text: { type: "string" }, url: { type: "string" } },
              required: [],
            },
          },
          attachment: {
            type: "object",
            properties: { id: { type: "string" }, name: { type: "string" }, type: { type: "string" } },
            required: [],
          },
          external_id: { type: "string" },
          request_id: { type: "string" },
          waba_footer: { type: "string" },
          waba_category: { type: "string" },
          waba_language: { type: "string" },
          waba_examples: { type: "string" },
          waba_header: { type: "string" },
          waba_header_type: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  "PATCH /api/v4/companies": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          responsible_user_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          custom_fields_values: { type: "string" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
            },
            required: [],
          },
          request_id: { type: "string" },
          tags_to_add: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
          tags_to_delete: {
            type: "array",
            items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } }, required: [] },
          },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/companies/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        responsible_user_id: { type: "integer", format: "int32" },
        created_by: { type: "integer", format: "int32" },
        updated_by: { type: "integer", format: "int32" },
        created_at: { type: "integer", format: "int32" },
        updated_at: { type: "integer", format: "int32" },
        custom_fields_values: { type: "string" },
        _embedded: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                required: [],
              },
            },
          },
          required: [],
        },
        request_id: { type: "string" },
        tags_to_add: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
            required: [],
          },
        },
        tags_to_delete: {
          type: "array",
          items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } }, required: [] },
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/contacts": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          responsible_user_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          custom_fields_values: { type: "string" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
            },
            required: [],
          },
          request_id: { type: "string" },
          tags_to_add: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
          tags_to_delete: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/contacts/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        responsible_user_id: { type: "integer", format: "int32" },
        created_by: { type: "integer", format: "int32" },
        updated_by: { type: "integer", format: "int32" },
        created_at: { type: "integer", format: "int32" },
        updated_at: { type: "integer", format: "int32" },
        custom_fields_values: { type: "string" },
        _embedded: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                required: [],
              },
            },
          },
          required: [],
        },
        request_id: { type: "string" },
        tags_to_add: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
            required: [],
          },
        },
        tags_to_delete: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
            required: [],
          },
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/leads": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          price: { type: "number" },
          status_id: { type: "integer", format: "int32" },
          pipeline_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          closed_at: { type: "integer", format: "int32" },
          loss_reason_id: { type: "integer", format: "int32" },
          responsible_user_id: { type: "integer", format: "int32" },
          custom_fields_values: { type: "string" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
            },
            required: [],
          },
          tags_to_add: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
          tags_to_delete: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
        },
        required: ["id"],
      },
    },
  },
  "PATCH /api/v4/leads/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "number" },
        status_id: { type: "integer", format: "int32" },
        pipeline_id: { type: "integer", format: "int32" },
        created_by: { type: "integer", format: "int32" },
        updated_by: { type: "integer", format: "int32" },
        created_at: { type: "integer", format: "int32" },
        updated_at: { type: "integer", format: "int32" },
        closed_at: { type: "integer", format: "int32" },
        loss_reason_id: { type: "integer", format: "int32" },
        responsible_user_id: { type: "integer", format: "int32" },
        custom_fields_values: { type: "string" },
        _embedded: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                required: [],
              },
            },
          },
          required: [],
        },
        request_id: { type: "string" },
        tags_to_add: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
            required: [],
          },
        },
        tags_to_delete: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
            required: [],
          },
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/leads/pipelines/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        sort: { type: "integer", format: "int32" },
        is_main: { type: "boolean" },
        is_unsorted_on: { type: "boolean" },
      },
      required: [],
    },
  },
  "PATCH /api/v4/leads/pipelines/{pipeline_id}/statuses/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        sort: { type: "integer", format: "int32" },
        color: { type: "string" },
        descriptions: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer", format: "int32" }, level: { type: "string" } },
            required: [],
          },
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/roles/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        rights: {
          type: "object",
          properties: {
            leads: {
              type: "object",
              properties: {
                view: { type: "string", enum: ["A", "G", "M", "D"] },
                edit: { type: "string", enum: ["A", "G", "M", "D"] },
                add: { type: "string", enum: ["A", "G", "M", "D"] },
                delete: { type: "string", enum: ["A", "G", "M", "D"] },
                export: { type: "string", enum: ["A", "G", "M", "D"] },
              },
              required: [],
            },
            contacts: {
              type: "object",
              properties: {
                view: { type: "string", enum: ["A", "G", "M", "D"] },
                edit: { type: "string", enum: ["A", "G", "M", "D"] },
                add: { type: "string", enum: ["A", "G", "M", "D"] },
                delete: { type: "string", enum: ["A", "G", "M", "D"] },
                export: { type: "string", enum: ["A", "G", "M", "D"] },
              },
              required: [],
            },
            companies: {
              type: "object",
              properties: {
                view: { type: "string", enum: ["A", "G", "M", "D"] },
                edit: { type: "string", enum: ["A", "G", "M", "D"] },
                add: { type: "string", enum: ["A", "G", "M", "D"] },
                delete: { type: "string", enum: ["A", "G", "M", "D"] },
                export: { type: "string", enum: ["A", "G", "M", "D"] },
              },
              required: [],
            },
            tasks: {
              type: "object",
              properties: {
                view: { type: "string", enum: ["A", "G", "M", "D"] },
                edit: { type: "string", enum: ["A", "G", "M", "D"] },
                add: { type: "string", enum: ["A", "G", "M", "D"] },
                delete: { type: "string", enum: ["A", "G", "M", "D"] },
                export: { type: "string", enum: ["A", "G", "M", "D"] },
              },
              required: [],
            },
            status_rights: { type: "string" },
            mail_access: { type: "boolean" },
            catalog_access: { type: "boolean" },
          },
          required: [],
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/sources": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          pipeline_id: { type: "integer", format: "int32" },
          origin_code: { type: "string" },
          services: {
            type: "object",
            properties: {
              type: { type: "string" },
              pages: {
                type: "array",
                items: {
                  type: "object",
                  properties: { name: { type: "string" }, id: { type: "string" }, link: { type: "string" } },
                  required: [],
                },
              },
              params: {
                type: "object",
                properties: { waba: { type: "boolean" }, is_supports_list_message: { type: "boolean" } },
                required: [],
              },
            },
            required: [],
          },
        },
        required: ["id"],
      },
    },
  },
  "PATCH /api/v4/sources/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        name: { type: "string" },
        pipeline_id: { type: "integer", format: "int32" },
        external_id: { type: "string" },
        origin_code: { type: "string" },
        services: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              pages: {
                type: "array",
                items: {
                  type: "object",
                  properties: { name: { type: "string" }, id: { type: "string" }, link: { type: "string" } },
                  required: [],
                },
              },
              params: {
                type: "object",
                properties: { waba: { type: "boolean" }, is_supports_list_message: { type: "boolean" } },
                required: [],
              },
            },
            required: [],
          },
        },
      },
      required: [],
    },
  },
  "PATCH /api/v4/tasks": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          responsible_user_id: { type: "integer", format: "int32" },
          entity_id: { type: "integer", format: "int32" },
          entity_type: { type: "string", enum: ["leads", "contacts", "companies"] },
          is_completed: { type: "boolean" },
          task_type_id: { type: "integer", format: "int32" },
          text: { type: "string" },
          duration: { type: "integer", format: "int32" },
          complete_till: { type: "integer", format: "int32" },
          result: { type: "object", properties: { text: { type: "string" } }, required: [] },
        },
        required: [],
      },
    },
  },
  "PATCH /api/v4/tasks/{id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        id: { type: "integer", format: "int32" },
        responsible_user_id: { type: "integer", format: "int32" },
        entity_id: { type: "integer", format: "int32" },
        entity_type: { type: "string", enum: ["leads", "contacts", "companies"] },
        is_completed: { type: "boolean" },
        task_type_id: { type: "integer", format: "int32" },
        text: { type: "string" },
        duration: { type: "integer", format: "int32" },
        complete_till: { type: "integer", format: "int32" },
        result: { type: "object", properties: { text: { type: "string" } }, required: [] },
      },
      required: [],
    },
  },
  "PATCH /api/v4/website_buttons/{source_id}": {
    query: {},
    body: {
      type: "object",
      properties: {
        trusted_websites: {
          type: "object",
          properties: { add: { type: "array", items: { type: "string" } } },
          required: [],
        },
      },
      required: [],
    },
  },
  "POST /api/v4/{bot}/{bot_id}/continue/{continue_id}": {
    query: {},
    body: {
      type: "object",
      properties: { data: { type: "string" }, execute_handlers: { type: "string" } },
      required: [],
    },
  },
  "POST /api/v4/{entity_type}/custom_fields": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          name: { type: "string" },
          code: { type: "string" },
          sort: { type: "integer" },
          group_id: { type: "string" },
          is_api_only: { type: "boolean" },
          required_statuses: {
            type: "array",
            items: {
              type: "object",
              properties: { status_id: { type: "integer" }, pipeline_id: { type: "integer" } },
              required: [],
            },
          },
          remind: { type: "string", enum: ["never", "day", "week", "month"] },
          enums: {
            type: "array",
            items: {
              type: "object",
              properties: { value: { type: "string" }, sort: { type: "integer" }, code: { type: "string" } },
              required: [],
            },
          },
          tracking_callback: { type: "string" },
          hidden_statuses: {
            type: "array",
            items: {
              type: "object",
              properties: { status_id: { type: "integer" }, pipeline_id: { type: "integer" } },
              required: [],
            },
          },
          chained_lists: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                catalog_id: { type: "integer" },
                parent_catalog_id: { type: "integer" },
              },
              required: [],
            },
          },
          search_in: { type: "string" },
          currency: { type: "string" },
        },
        required: ["type", "name"],
      },
    },
  },
  "POST /api/v4/{entity_type}/custom_fields/groups": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, sort: { type: "integer" }, request_id: { type: "string" } },
        required: ["name"],
      },
    },
  },
  "POST /api/v4/{entity_type}/notes": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entity_id: { type: "integer", format: "int32" },
          note_type: {
            type: "string",
            enum: [
              "common",
              "call_in",
              "call_out",
              "service_message",
              "geolocation",
              "sms_in",
              "sms_out",
              "extended_service_message",
              "attachment",
            ],
          },
          params: { type: "string" },
          request_id: { type: "string" },
          is_need_to_trigger_digital_pipeline: { type: "boolean" },
        },
        required: ["entity_id"],
      },
    },
  },
  "POST /api/v4/{entity_type}/notes/{id}/pin": { query: {} },
  "POST /api/v4/{entity_type}/notes/{id}/unpin": { query: {} },
  "POST /api/v4/{entity_type}/tags": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, color: { type: "string" }, request_id: { type: "string" } },
        required: ["name"],
      },
    },
  },
  "POST /api/v4/{entity}/{entity_id}/link": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          to_entity_id: { type: "integer", format: "int32" },
          to_entity_type: { type: "string", enum: ["leads", "contacts", "companies", "catalog_elements"] },
          metadata: {
            type: "object",
            properties: {
              catalog_id: { type: "integer", format: "int32" },
              quantity: { type: "integer", format: "int32" },
              is_main: { type: "boolean" },
              updated_by: { type: "integer", format: "int32" },
            },
            required: [],
          },
        },
        required: ["to_entity_id", "to_entity_type"],
      },
    },
  },
  "POST /api/v4/{entity}/{entity_id}/unlink": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          to_entity_type: { type: "string" },
          to_entity_id: { type: "integer", format: "int32" },
          metadata: {
            type: "object",
            properties: {
              catalog_id: { type: "integer", format: "int32" },
              updated_by: { type: "integer", format: "int32" },
            },
            required: [],
          },
        },
        required: [],
      },
    },
  },
  "POST /api/v4/bots/{id}/run": {
    query: {},
    body: {
      type: "object",
      properties: {
        entity_id: { type: "integer", format: "int32" },
        entity_type: { type: "string", enum: ["leads", "contacts"] },
      },
      required: ["entity_id", "entity_type"],
    },
  },
  "POST /api/v4/bots/{id}/stop": {
    query: {},
    body: {
      type: "object",
      properties: { entity_id: { type: "integer" }, entity_type: { type: "string", enum: ["leads"] } },
      required: ["entity_id", "entity_type"],
    },
  },
  "POST /api/v4/bots/run": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bot_id: { type: "integer" },
          entity_id: { type: "integer" },
          entity_type: { type: "string", enum: ["leads", "contacts"] },
        },
        required: ["bot_id", "entity_id", "entity_type"],
      },
    },
  },
  "POST /api/v4/calls": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["inbound", "outbound"] },
          uniq: { type: "string" },
          duration: { type: "integer", format: "int32" },
          source: { type: "string" },
          link: { type: "string" },
          phone: { type: "string" },
          call_result: { type: "string" },
          call_status: { type: "integer", format: "int32" },
          responsible_user_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          request_id: { type: "string" },
          call_responsible: { type: "string" },
        },
        required: ["direction", "duration", "source", "phone"],
      },
    },
  },
  "POST /api/v4/catalogs": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["regular"] },
          sort: { type: "integer", format: "int32" },
          can_link_multiple: { type: "boolean" },
          request_id: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  "POST /api/v4/catalogs/{list_id}/custom_fields": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "text",
              "numeric",
              "checkbox",
              "select",
              "multiselect",
              "date",
              "url",
              "textarea",
              "radiobutton",
              "streetaddress",
              "smart_address",
              "birthday",
              "legal_entity",
              "date_time",
              "price",
              "category",
              "file",
            ],
          },
          name: { type: "string" },
          code: { type: "string" },
          sort: { type: "integer", format: "int32" },
          settings: { type: "string" },
          is_visible: { type: "boolean" },
          is_required: { type: "boolean" },
          remind: { type: "string" },
          enums: {
            type: "array",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                sort: { type: "integer", format: "int32" },
                code: { type: "string" },
              },
              required: [],
            },
          },
          nested: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer", format: "int32" },
                parent_id: { type: "integer", format: "int32" },
                value: { type: "string" },
                sort: { type: "integer", format: "int32" },
                request_id: { type: "string" },
                parent_request_id: { type: "string" },
              },
              required: [],
            },
          },
        },
        required: ["type", "name"],
      },
    },
  },
  "POST /api/v4/catalogs/{list_id}/elements": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          custom_fields_values: { type: "string" },
          request_id: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  "POST /api/v4/chats/templates": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          content: { type: "string" },
          is_editable: { type: "boolean" },
          type: { type: "string" },
          buttons: {
            type: "array",
            items: {
              type: "object",
              properties: { type: { type: "string" }, text: { type: "string" }, url: { type: "string" } },
              required: [],
            },
          },
          attachment: {
            type: "object",
            properties: { id: { type: "string" }, name: { type: "string" }, type: { type: "string" } },
            required: [],
          },
          external_id: { type: "string" },
          request_id: { type: "string" },
          waba_footer: { type: "string" },
          waba_category: { type: "string", enum: ["UTILITY", "AUTHENTICATION", "MARKETING"] },
          waba_language: { type: "string" },
          waba_examples: { type: "string" },
          waba_header: { type: "string" },
          waba_header_type: { type: "string" },
        },
        required: ["name", "content"],
      },
    },
  },
  "POST /api/v4/chats/templates/{id}/review": { query: {} },
  "POST /api/v4/chats/templates/{id}/review/{review_id}": {
    query: {},
    body: {
      type: "object",
      properties: { status: { type: "string" }, reject_reason: { type: "string" } },
      required: [],
    },
  },
  "POST /api/v4/companies": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int32" },
          name: { type: "string" },
          responsible_user_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          custom_fields_values: { type: "string" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
            },
            required: [],
          },
          request_id: { type: "string" },
          tags_to_add: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
        },
        required: [],
      },
    },
  },
  "POST /api/v4/contacts": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          responsible_user_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          custom_fields_values: { type: "string" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
            },
            required: [],
          },
          tags_to_add: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
        },
        required: [],
      },
    },
  },
  "POST /api/v4/contacts/chats": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: { contact_id: { type: "integer", format: "int32" }, chat_id: { type: "string" } },
        required: [],
      },
    },
  },
  "POST /api/v4/leads": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          status_id: { type: "integer", format: "int32" },
          pipeline_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          closed_at: { type: "integer", format: "int32" },
          loss_reason_id: { type: "integer", format: "int32" },
          responsible_user_id: { type: "integer", format: "int32" },
          custom_fields_values: { type: "string" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
              contacts: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, is_main: { type: "boolean" } },
                  required: [],
                },
              },
              companies: {
                type: "array",
                items: { type: "object", properties: { id: { type: "integer", format: "int32" } }, required: [] },
              },
              source: {
                type: "object",
                properties: { external_id: { type: "string" }, type: { type: "string", enum: ["widget"] } },
                required: [],
              },
            },
            required: [],
          },
          tags_to_add: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
        },
        required: [],
      },
    },
  },
  "POST /api/v4/leads/complex": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          status_id: { type: "integer", format: "int32" },
          pipeline_id: { type: "integer", format: "int32" },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          closed_at: { type: "integer", format: "int32" },
          loss_reason_id: { type: "integer", format: "int32" },
          responsible_user_id: { type: "integer", format: "int32" },
          custom_fields_values: { type: "string" },
          _embedded: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                  required: [],
                },
              },
              contacts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    first_name: { type: "string" },
                    last_name: { type: "string" },
                    responsible_user_id: { type: "integer", format: "int32" },
                    created_by: { type: "integer", format: "int32" },
                    updated_by: { type: "integer", format: "int32" },
                    created_at: { type: "integer", format: "int32" },
                    updated_at: { type: "integer", format: "int32" },
                    custom_fields_values: { type: "string" },
                    tags_to_add: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                    request_id: { type: "string" },
                  },
                  required: [],
                },
              },
              companies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    custom_fields_values: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: {
                            type: "string",
                            enum: [
                              "text",
                              "numeric",
                              "checkbox",
                              "select",
                              "multiselect",
                              "date",
                              "url",
                              "textarea",
                              "radiobutton",
                              "streetaddress",
                              "smart_address",
                              "birthday",
                              "legal_entity",
                              "date_time",
                              "price",
                              "category",
                              "file",
                            ],
                          },
                          name: { type: "string" },
                          code: { type: "string" },
                          sort: { type: "integer", format: "int32" },
                          group_id: { type: "string" },
                          is_api_only: { type: "boolean" },
                          required_statuses: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                status_id: { type: "integer", format: "int32" },
                                pipeline_id: { type: "integer", format: "int32" },
                              },
                              required: [],
                            },
                          },
                          remind: { type: "string" },
                          enums: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                value: { type: "string" },
                                sort: { type: "integer", format: "int32" },
                                code: { type: "string" },
                              },
                              required: [],
                            },
                          },
                          nested: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "integer", format: "int32" },
                                parent_id: { type: "integer", format: "int32" },
                                value: { type: "string" },
                                sort: { type: "integer", format: "int32" },
                                request_id: { type: "string" },
                                parent_request_id: { type: "string" },
                              },
                              required: [],
                            },
                          },
                        },
                        required: ["type", "name"],
                      },
                    },
                    responsible_user_id: { type: "integer", format: "int32" },
                  },
                  required: [],
                },
              },
              metadata: { type: "string" },
              source: {
                type: "object",
                properties: { external_id: { type: "string" }, type: { type: "string" } },
                required: [],
              },
            },
            required: [],
          },
          tags_to_add: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
              required: [],
            },
          },
        },
        required: [],
      },
    },
  },
  "POST /api/v4/leads/pipelines": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          sort: { type: "integer", format: "int32" },
          is_main: { type: "boolean" },
          is_unsorted_on: { type: "boolean" },
          _embedded: {
            type: "object",
            properties: {
              statuses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer", format: "int32" },
                    name: { type: "string" },
                    sort: { type: "integer", format: "int32" },
                    color: { type: "string" },
                    request_id: { type: "string" },
                    descriptions: { type: "object", properties: { level: { type: "string" } }, required: [] },
                  },
                  required: [],
                },
              },
            },
            required: [],
          },
          request_id: { type: "string" },
        },
        required: ["name", "sort", "is_main", "is_unsorted_on"],
      },
    },
  },
  "POST /api/v4/leads/pipelines/{pipeline_id}/statuses": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          sort: { type: "integer", format: "int32" },
          color: { type: "string" },
          request_id: { type: "string" },
          descriptions: {
            type: "array",
            items: { type: "object", properties: { level: { type: "string" } }, required: [] },
          },
        },
        required: ["name", "sort"],
      },
    },
  },
  "POST /api/v4/leads/unsorted/{uid}/accept": {
    query: {},
    body: {
      type: "object",
      properties: { user_id: { type: "integer", format: "int32" }, status_id: { type: "integer", format: "int32" } },
      required: [],
    },
  },
  "POST /api/v4/leads/unsorted/{uid}/link": {
    query: {},
    body: {
      type: "object",
      properties: {
        link: {
          type: "object",
          properties: {
            entity_id: { type: "integer", format: "int32" },
            entity_type: { type: "string" },
            metadata: {
              type: "object",
              properties: { contact_id: { type: "integer", format: "int32" } },
              required: [],
            },
          },
          required: [],
        },
        user_id: { type: "integer", format: "int32" },
      },
      required: [],
    },
  },
  "POST /api/v4/leads/unsorted/forms": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_uid: { type: "string" },
          source_name: { type: "string" },
          pipeline_id: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          metadata: {
            type: "object",
            properties: {
              form_id: { type: "string" },
              form_name: { type: "string" },
              form_page: { type: "string" },
              ip: { type: "string" },
              form_sent_at: { type: "integer", format: "int32" },
              referer: { type: "string" },
            },
            required: [],
          },
          _embedded: {
            type: "object",
            properties: {
              contacts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    first_name: { type: "string" },
                    last_name: { type: "string" },
                    responsible_user_id: { type: "integer", format: "int32" },
                    created_by: { type: "integer", format: "int32" },
                    updated_by: { type: "integer", format: "int32" },
                    created_at: { type: "integer", format: "int32" },
                    updated_at: { type: "integer", format: "int32" },
                    custom_fields_values: { type: "string" },
                    tags_to_add: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                    request_id: { type: "string" },
                  },
                  required: [],
                },
              },
              companies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer", format: "int32" },
                    name: { type: "string" },
                    responsible_user_id: { type: "integer", format: "int32" },
                    created_by: { type: "integer", format: "int32" },
                    updated_by: { type: "integer", format: "int32" },
                    created_at: { type: "integer", format: "int32" },
                    updated_at: { type: "integer", format: "int32" },
                    custom_fields_values: { type: "string" },
                    _embedded: {
                      type: "object",
                      properties: {
                        tags: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                            required: [],
                          },
                        },
                      },
                      required: [],
                    },
                    request_id: { type: "string" },
                    tags_to_add: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                  },
                  required: [],
                },
              },
              leads: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    price: { type: "integer", format: "int32" },
                    status_id: { type: "integer", format: "int32" },
                    pipeline_id: { type: "integer", format: "int32" },
                    created_by: { type: "integer", format: "int32" },
                    updated_by: { type: "integer", format: "int32" },
                    created_at: { type: "integer", format: "int32" },
                    updated_at: { type: "integer", format: "int32" },
                    closed_at: { type: "integer", format: "int32" },
                    loss_reason_id: { type: "integer", format: "int32" },
                    responsible_user_id: { type: "integer", format: "int32" },
                    custom_fields_values: { type: "string" },
                    _embedded: {
                      type: "object",
                      properties: {
                        tags: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                            required: [],
                          },
                        },
                        contacts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" }, is_main: { type: "boolean" } },
                            required: [],
                          },
                        },
                        companies: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" } },
                            required: [],
                          },
                        },
                        source: {
                          type: "object",
                          properties: { external_id: { type: "string" }, type: { type: "string" } },
                          required: [],
                        },
                      },
                      required: [],
                    },
                    tags_to_add: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                    tags_to_delete: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                  },
                  required: [],
                },
              },
            },
            required: [],
          },
          request_id: { type: "string" },
        },
        required: ["source_uid", "source_name"],
      },
    },
  },
  "POST /api/v4/leads/unsorted/sip": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_uid: { type: "string" },
          source_name: { type: "string" },
          pipeline_id: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          metadata: {
            type: "object",
            properties: {
              uniq: { type: "string" },
              from: { type: "string" },
              phone: { type: "string" },
              called_at: { type: "integer", format: "int32" },
              duration: { type: "integer", format: "int32" },
              link: { type: "string" },
              service_code: { type: "string" },
              is_call_event_needed: { type: "boolean" },
              call_responsible: { type: "string" },
            },
            required: [],
          },
          _embedded: {
            type: "object",
            properties: {
              contacts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    first_name: { type: "string" },
                    last_name: { type: "string" },
                    responsible_user_id: { type: "integer", format: "int32" },
                    created_by: { type: "integer", format: "int32" },
                    updated_by: { type: "integer", format: "int32" },
                    created_at: { type: "integer", format: "int32" },
                    updated_at: { type: "integer", format: "int32" },
                    custom_fields_values: { type: "string" },
                    tags_to_add: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                    request_id: { type: "string" },
                  },
                  required: [],
                },
              },
              companies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer", format: "int32" },
                    name: { type: "string" },
                    responsible_user_id: { type: "integer", format: "int32" },
                    created_by: { type: "integer", format: "int32" },
                    updated_by: { type: "integer", format: "int32" },
                    created_at: { type: "integer", format: "int32" },
                    updated_at: { type: "integer", format: "int32" },
                    custom_fields_values: { type: "string" },
                    _embedded: {
                      type: "object",
                      properties: {
                        tags: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                            required: [],
                          },
                        },
                      },
                      required: [],
                    },
                    request_id: { type: "string" },
                    tags_to_add: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                  },
                  required: [],
                },
              },
              leads: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    price: { type: "integer", format: "int32" },
                    status_id: { type: "integer", format: "int32" },
                    pipeline_id: { type: "integer", format: "int32" },
                    created_by: { type: "integer", format: "int32" },
                    updated_by: { type: "integer", format: "int32" },
                    created_at: { type: "integer", format: "int32" },
                    updated_at: { type: "integer", format: "int32" },
                    closed_at: { type: "integer", format: "int32" },
                    loss_reason_id: { type: "integer", format: "int32" },
                    responsible_user_id: { type: "integer", format: "int32" },
                    custom_fields_values: { type: "string" },
                    _embedded: {
                      type: "object",
                      properties: {
                        tags: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                            required: [],
                          },
                        },
                        contacts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" }, is_main: { type: "boolean" } },
                            required: [],
                          },
                        },
                        companies: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: "integer", format: "int32" } },
                            required: [],
                          },
                        },
                        source: {
                          type: "object",
                          properties: { external_id: { type: "string" }, type: { type: "string" } },
                          required: [],
                        },
                      },
                      required: [],
                    },
                    tags_to_add: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                    tags_to_delete: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer", format: "int32" }, name: { type: "string" } },
                        required: [],
                      },
                    },
                  },
                  required: [],
                },
              },
            },
            required: [],
          },
          request_id: { type: "string" },
        },
        required: ["source_uid", "source_name"],
      },
    },
  },
  "POST /api/v4/roles": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          rights: {
            type: "object",
            properties: {
              leads: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              contacts: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              companies: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              tasks: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              status_rights: { type: "string" },
              mail_access: { type: "boolean" },
              catalog_access: { type: "boolean" },
            },
            required: [],
          },
          request_id: { type: "string" },
        },
        required: [],
      },
    },
  },
  "POST /api/v4/sources": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          pipeline_id: { type: "integer", format: "int32" },
          external_id: { type: "string" },
          origin_code: { type: "string" },
          services: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                pages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, id: { type: "string" }, link: { type: "string" } },
                    required: [],
                  },
                },
                params: {
                  type: "object",
                  properties: { waba: { type: "boolean" }, is_supports_list_message: { type: "boolean" } },
                  required: [],
                },
              },
              required: [],
            },
          },
        },
        required: [],
      },
    },
  },
  "POST /api/v4/talks/{id}/close": {
    query: {},
    body: { type: "object", properties: { force_close: { type: "boolean" } }, required: [] },
  },
  "POST /api/v4/talks/{talk_id}/send_message": {
    query: {},
    body: {
      type: "object",
      properties: {
        text: { type: "string" },
        attachment: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["file", "video", "picture"] },
            drive_uuid: { type: "string" },
            drive_version_uuid: { type: "string" },
          },
          required: ["drive_uuid", "drive_version_uuid", "type"],
        },
      },
      required: [],
    },
  },
  "POST /api/v4/tasks": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          responsible_user_id: { type: "integer", format: "int32" },
          entity_id: { type: "integer", format: "int32" },
          entity_type: { type: "string", enum: ["leads", "contacts", "companies"] },
          is_completed: { type: "boolean" },
          task_type_id: { type: "integer", format: "int32" },
          text: { type: "string" },
          duration: { type: "integer", format: "int32" },
          complete_till: { type: "integer", format: "int32" },
          result: { type: "object", properties: { text: { type: "string" } }, required: [] },
          created_by: { type: "integer", format: "int32" },
          updated_by: { type: "integer", format: "int32" },
          created_at: { type: "integer", format: "int32" },
          updated_at: { type: "integer", format: "int32" },
          request_id: { type: "string" },
        },
        required: ["text", "complete_till"],
      },
    },
  },
  "POST /api/v4/users": {
    query: {},
    body: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          password: { type: "string" },
          lang: { type: "string", enum: ["ru", "en", "es", "pt", "tr", "id"] },
          rights: {
            type: "object",
            properties: {
              leads: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              contacts: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              companies: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              tasks: {
                type: "object",
                properties: {
                  view: { type: "string", enum: ["A", "G", "M", "D"] },
                  edit: { type: "string", enum: ["A", "G", "M", "D"] },
                  add: { type: "string", enum: ["A", "G", "M", "D"] },
                  delete: { type: "string", enum: ["A", "G", "M", "D"] },
                  export: { type: "string", enum: ["A", "G", "M", "D"] },
                },
                required: [],
              },
              status_rights: { type: "string" },
              mail_access: { type: "boolean" },
              catalog_access: { type: "boolean" },
              role_id: { type: "integer" },
              group_id: { type: "integer" },
              request_id: { type: "string" },
            },
            required: [],
          },
        },
        required: ["name", "email", "password"],
      },
    },
  },
  "POST /api/v4/users/activate": {
    query: {},
    body: { type: "array", items: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] } },
  },
  "POST /api/v4/users/deactivate": {
    query: {},
    body: { type: "array", items: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] } },
  },
  "POST /api/v4/webhooks": {
    query: {},
    body: {
      type: "object",
      properties: { destination: { type: "string" }, settings: { type: "array", items: { type: "string" } } },
      required: [],
    },
  },
  "POST /api/v4/website_buttons": {
    query: {},
    body: {
      type: "object",
      properties: {
        pipeline_id: { type: "integer", format: "int32" },
        trusted_websites: { type: "array", items: { type: "string" } },
        is_used_in_app: { type: "boolean" },
      },
      required: ["pipeline_id"],
    },
  },
  "POST /api/v4/website_buttons/{source_id}/online_chat": { query: {} },
  "POST /api/v4/widgets/{widget_code}": { query: {}, body: { type: "string" } },
  "PUT /api/v4/{entity}/{entity_id}/files": {
    query: {},
    body: { type: "array", items: { type: "object", properties: { file_uuid: { type: "string" } }, required: [] } },
  },
} as Readonly<Record<string, KommoSchema>>
