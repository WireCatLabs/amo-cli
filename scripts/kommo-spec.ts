import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { adaptOpenApi, generate, writeArtifacts } from "@wirecat/cli-base/codegen"
import { hostFetch } from "@wirecat/cli-base/http"

/*
 * pnpm kommo:operations [--check]  src/amo/operations.ts from contracts/kommo-openapi.json
 * pnpm kommo:fetch                 contracts/kommo-openapi.json again from https://developers.kommo.com/llms.txt
 *
 * The fetch is the TypeScript form of the plan's merge_oas.py: each reference page carries its operation as an
 * "# OpenAPI definition" JSON block, merged first-seen-wins. One page a second, as a person reading the docs would.
 */

const root = resolve(import.meta.dirname, "..")
const SPEC = "contracts/kommo-openapi.json"
const OUT = "src/amo/operations.ts"
/** Test code only: the fake checks every query value and body against them, so the CLI's bundle never carries them. */
const SCHEMAS_OUT = "src/testing/kommo-schemas.ts"
const DOCS = "https://developers.kommo.com"
const VERBS = ["get", "post", "patch", "put", "delete"] as const
const PAGE_GAP_MS = 1_000

type Json = Record<string, unknown>
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const refetch = async () => {
  const fetch = hostFetch({ hosts: ["developers.kommo.com"] })
  const text = async (url: string) => {
    const response = await fetch(url, { headers: { accept: "text/markdown, text/plain" } })
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    return response.text()
  }
  const index = await text(`${DOCS}/llms.txt`)
  const pages = [
    ...new Set([...index.matchAll(/https:\/\/developers\.kommo\.com\/reference\/[a-z0-9-]+/g)].map(String)),
  ]
  const merged: Json = {
    openapi: "3.1.0",
    info: { title: "Kommo API v4 (merged from developers.kommo.com reference pages)", version: "v4" },
    servers: [{ url: "https://{subdomain}.kommo.com" }],
    paths: {},
    components: {},
  }
  const paths = merged.paths as Record<string, Json>
  const components = merged.components as Record<string, Json>
  const failed: string[] = []
  for (const page of pages.sort()) {
    await new Promise((done) => setTimeout(done, PAGE_GAP_MS))
    const found = /# OpenAPI definition\s*```json\s*(\{.*?\})\s*```/s.exec(await text(`${page}.md`))
    if (!found?.[1]) continue
    let spec: Json
    try {
      spec = JSON.parse(found[1]) as Json
    } catch (error) {
      failed.push(`${page}: ${(error as Error).message}`)
      continue
    }
    for (const [path, ops] of Object.entries(isRecord(spec.paths) ? spec.paths : {})) {
      paths[path] ??= {}
      const slot = paths[path]
      for (const [key, op] of Object.entries(isRecord(ops) ? ops : {})) {
        if (isRecord(op)) op["x-source-page"] ??= page
        slot[key] ??= op
      }
    }
    for (const [key, value] of Object.entries(isRecord(spec.components) ? spec.components : {}))
      components[key] = { ...components[key], ...(isRecord(value) ? value : {}) }
  }
  writeFileSync(join(root, SPEC), `${JSON.stringify(merged, null, 2)}\n`)
  process.stderr.write(`${Object.keys(paths).length} paths from ${pages.length} pages, ${failed.length} failed\n`)
  for (const line of failed) process.stderr.write(`${line}\n`)
}

/** The account's CRM API only: the Chats API, Drive and the AI agent API live on other hosts this CLI never reaches. */
const onAccountHost = (path: string) => path.startsWith("/api/v4/")

/** What a check needs: types, enums, required names. Descriptions and examples are the pages' prose. */
const PROSE = new Set(["description", "deprecated", "default", "sensitive"])
const bare = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(bare)
  if (!isRecord(node)) return node
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !PROSE.has(key))
      .map(([key, value]) => [key, bare(value)]),
  )
}

/** The merged pages wrap an array body in a `RAW_BODY` property that is not sent: the array is the body. */
const unwrapped = (node: unknown): unknown => {
  if (!isRecord(node) || node.type !== "object" || !isRecord(node.properties)) return node
  const names = Object.keys(node.properties)
  return names.length === 1 && names[0] === "RAW_BODY" ? node.properties.RAW_BODY : node
}

const operations = () => {
  const document = JSON.parse(readFileSync(join(root, SPEC), "utf8")) as Json
  const all = document.paths as Record<string, Json>
  const sources = new Map<string, string>()
  for (const [path, ops] of Object.entries(all))
    for (const verb of VERBS) {
      const op = ops[verb]
      if (isRecord(op) && typeof op["x-source-page"] === "string")
        sources.set(`${verb.toUpperCase()} ${path}`, op["x-source-page"])
    }
  document.paths = Object.fromEntries(Object.entries(all).filter(([path]) => onAccountHost(path)))
  const model = adaptOpenApi(document, { sourceUrl: `${DOCS}/llms.txt` })
  const schemas: Record<string, { query: Record<string, unknown>; body?: unknown }> = {}
  const rows = model.operations
    .flatMap((op) => (op.binding.kind === "http" ? [{ op, binding: op.binding }] : []))
    .map(({ op, binding }) => {
      const name = `${binding.method} ${binding.path}`
      const source = sources.get(name)
      if (!source) throw new Error(`${name} has no x-source-page`)
      const pathParams = Object.fromEntries(
        op.parameters
          .filter((one) => one.in === "path")
          .map((one) => {
            const schema = one.schema
            if (schema.type === "integer") return [one.name, { type: "integer" }]
            if (schema.type === "string" && schema.enum) return [one.name, { type: "string", enum: schema.enum }]
            return [one.name, { type: "string" }]
          }),
      )
      schemas[name] = {
        query: Object.fromEntries(
          op.parameters.filter((one) => one.in === "query").map((one) => [one.name, bare(one.schema)]),
        ),
        ...(op.requestBody ? { body: bare(unwrapped(op.requestBody.schema)) } : {}),
      }
      return {
        name,
        effect: op.effect,
        summary: op.summary ?? "",
        source,
        path: pathParams,
        query: op.parameters.filter((one) => one.in === "query").map((one) => one.name),
        body: op.requestBody !== undefined,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const content = [
    `import type { SpecOperation } from "./operation.js"`,
    "",
    `export const SPEC_OPERATIONS: readonly SpecOperation[] = ${JSON.stringify(rows)}`,
    "",
  ].join("\n")
  const sorted = Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b)))
  const schemaContent = [
    `import type { SchemaNode } from "@wirecat/cli-base/codegen"`,
    "",
    "export interface KommoSchema {",
    "  query: Readonly<Record<string, SchemaNode>>",
    "  body?: SchemaNode",
    "}",
    "",
    `export const KOMMO_SCHEMAS: Readonly<Record<string, KommoSchema>> = ${JSON.stringify(sorted)} as Readonly<Record<string, KommoSchema>>`,
    "",
  ].join("\n")
  const artifacts = generate(
    model,
    [
      () => [
        { path: OUT, content },
        { path: SCHEMAS_OUT, content: schemaContent },
      ],
    ],
    { banner: [`Source: ${SPEC}`, "Run: pnpm kommo:operations"] },
  )
  const check = process.argv.includes("--check")
  const stale = writeArtifacts(artifacts, {
    root,
    check,
    format: (path, text) =>
      execFileSync(
        process.execPath,
        [join(root, "node_modules/@biomejs/biome/bin/biome"), "format", `--stdin-file-path=${path}`],
        { input: text, encoding: "utf8", cwd: root },
      ),
  })
  if (check && stale.length) {
    process.stderr.write(`${stale.join(", ")} stale; run pnpm kommo:operations\n`)
    process.exitCode = 1
    return
  }
  process.stderr.write(`${rows.length} operations, ${stale.length} files ${check ? "checked" : "written"}\n`)
}

const mode = process.argv[2]
if (mode === "fetch") await refetch()
else if (mode === "operations") operations()
else {
  process.stderr.write("usage: node scripts/kommo-spec.ts fetch | operations [--check]\n")
  process.exitCode = 2
}
