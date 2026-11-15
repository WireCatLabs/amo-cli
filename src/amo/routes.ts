/**
 * Every operation amo's own code calls by name. `AmoRequest.route` takes only these or an operation `api call` has
 * matched, so the contract test reads the whole list here and checks each against the spec's table.
 */
export const ROUTES = {
  account: "GET /api/v4/account",
  user: "GET /api/v4/users/{id}",
} as const

export type Route = (typeof ROUTES)[keyof typeof ROUTES]
