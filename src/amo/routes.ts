/**
 * Every operation amo's own code calls by name. `AmoRequest.route` takes only these or an operation `api call` has
 * matched, so the contract test reads the whole list here and checks each against the spec's table.
 */
export const ROUTES = {
  account: "GET /api/v4/account",
  user: "GET /api/v4/users/{id}",
  users: "GET /api/v4/users",
  pipelines: "GET /api/v4/leads/pipelines",
  lossReasons: "GET /api/v4/leads/loss_reasons",
  events: "GET /api/v4/events",
  tasks: "GET /api/v4/tasks",
  leadNotes: "GET /api/v4/leads/notes",
  contactNotes: "GET /api/v4/contacts/notes",
  companyNotes: "GET /api/v4/companies/notes",
  leads: "GET /api/v4/leads",
  lead: "GET /api/v4/leads/{id}",
  leadFields: "GET /api/v4/leads/custom_fields",
  createLeads: "POST /api/v4/leads",
  updateLeads: "PATCH /api/v4/leads",
  contacts: "GET /api/v4/contacts",
  contact: "GET /api/v4/contacts/{id}",
  contactFields: "GET /api/v4/contacts/custom_fields",
  createContacts: "POST /api/v4/contacts",
  updateContacts: "PATCH /api/v4/contacts",
  companies: "GET /api/v4/companies",
  company: "GET /api/v4/companies/{id}",
  companyFields: "GET /api/v4/companies/custom_fields",
  createCompanies: "POST /api/v4/companies",
  updateCompanies: "PATCH /api/v4/companies",
} as const

export type Route = (typeof ROUTES)[keyof typeof ROUTES]

/**
 * The API's word for each kind the CRM port copies. `event` prefixes its `_deleted` and `_restored` event types
 * (https://www.amocrm.ru/developers/content/crm_platform/events-and-notes, the table of event types, read 2026-11-16).
 */
export const ENTITIES = {
  deal: {
    list: ROUTES.leads,
    one: ROUTES.lead,
    fields: ROUTES.leadFields,
    create: ROUTES.createLeads,
    update: ROUTES.updateLeads,
    name: "leads",
    event: "lead",
  },
  person: {
    list: ROUTES.contacts,
    one: ROUTES.contact,
    fields: ROUTES.contactFields,
    create: ROUTES.createContacts,
    update: ROUTES.updateContacts,
    name: "contacts",
    event: "contact",
  },
  organization: {
    list: ROUTES.companies,
    one: ROUTES.company,
    fields: ROUTES.companyFields,
    create: ROUTES.createCompanies,
    update: ROUTES.updateCompanies,
    name: "companies",
    event: "company",
  },
} as const

export type AmoKind = keyof typeof ENTITIES
