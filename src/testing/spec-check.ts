import type { SchemaNode } from "@wirecat/cli-base/codegen"
import { integer, number } from "@wirecat/cli-base/codegen/runtime"
import { checkApiParameter } from "@wirecat/cli-core/cli"
import * as v from "valibot"
import { BODY_FIELDS } from "../amo/allow-list.js"
import type { Operation } from "../amo/operation.js"
import { KOMMO_SCHEMAS } from "./kommo-schemas.js"

/*
 * The fake's check of what a request sends, against the schemas `pnpm kommo:operations` keeps from the spec: valibot
 * judges a body, cli-core's `checkApiParameter` a query value. An object refuses a field it does not declare, which
 * the spec leaves open: the fake is the strict side, so a test never passes on a field amoCRM would drop (WC-TEST-19).
 */

const schemaOf = (node: SchemaNode, name = ""): v.GenericSchema => {
  const fixed = BODY_FIELDS[name]?.schema ?? node
  const base = bareOf(fixed)
  return fixed.nullable ? v.nullable(base) : base
}

const bareOf = (node: SchemaNode): v.GenericSchema => {
  switch (node.type) {
    case "string":
      return node.enum ? v.picklist(node.enum) : v.string()
    case "integer":
      return node.enum ? v.pipe(integer(node), v.picklist(node.enum)) : integer(node)
    case "number":
      return number(node)
    case "boolean":
      return v.boolean()
    case "array":
      return v.array(schemaOf(node.items))
    case "object": {
      const names = Object.keys(node.properties)
      if (names.length === 0) return v.record(v.string(), v.unknown())
      const entries = Object.fromEntries(
        names.map((name) => {
          const schema = schemaOf(node.properties[name] as SchemaNode, name)
          return [name, node.required.includes(name) ? schema : v.optional(schema)]
        }),
      )
      return node.additionalProperties
        ? v.objectWithRest(entries, schemaOf(node.additionalProperties))
        : v.strictObject(entries)
    }
    case "unknown":
      return v.unknown()
    default:
      // No generated schema has a union, an allOf or a ref today; a spec that brings one needs its check written.
      throw new Error(`the fake has no check for a ${node.type} schema`)
  }
}

const bodies = new Map<string, v.GenericSchema>()

/** The paths of what is wrong in a body, never the values: a path and what it expects. */
export const bodyProblems = (operation: Operation, body: unknown): string[] => {
  const node = KOMMO_SCHEMAS[operation.spec]?.body
  if (!node) return []
  let schema = bodies.get(operation.spec)
  if (!schema) {
    schema = schemaOf(node)
    bodies.set(operation.spec, schema)
  }
  const result = v.safeParse(schema, body)
  return result.success ? [] : result.issues.map((issue) => v.getDotPath(issue) ?? "body")
}

/** `filter[statuses][1][status_id]` is the spec's `[0]` form for another pipeline; `filter[type][]` its `filter[type]`. */
const shapeOf = (name: string) => name.replace(/\[\d+\]/g, "[0]").replace(/\[\]$/, "")

/** The declared parameter a sent name stands for, or none. */
export const declaredParameter = (operation: Operation, name: string): string | undefined => {
  if (operation.query.includes(name)) return name
  return operation.query.find((one) => shapeOf(one) === shapeOf(name))
}

/**
 * Whether a query value fits its declared type: one value unless the parameter is a list, or sent in the ru pages'
 * repeated `name[]` form of a comma list.
 */
export const parameterProblem = (
  operation: Operation,
  declared: string,
  sent: string,
  values: string[],
): string | undefined => {
  const node = KOMMO_SCHEMAS[operation.spec]?.query[declared]
  if (!node) return undefined
  if (node.type !== "array" && values.length > 1 && !(sent.endsWith("[]") && !declared.endsWith("[]")))
    return `${declared} takes one value`
  const item = node.type === "array" ? node.items : node
  return values.map((one) => checkApiParameter(declared, item, one, {})).find((one) => one !== undefined)
}
