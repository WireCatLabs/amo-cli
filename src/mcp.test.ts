import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { changesAuthorityAt, type RunOptions, readsOverMcpAt } from "@wirecat/cli-core/cli"
import { mcpOverStdio, ownCatalogue } from "@wirecat/cli-core/testing"
import { expect, it } from "vitest"
import { permissions } from "./config.js"
import type { AmoEnvironment } from "./context.js"
import { IDENTITY } from "./identity.js"
import { createProgram, run } from "./program.js"
import { fakeAmo } from "./testing/fake-amo.js"
import { amo, signedIn } from "./testing/harness.js"

it("mcp serve offers search, read and write, and runs a command through the CLI", async () => {
  const mcp = await mcpOverStdio((streams) => run(["work", "mcp", "serve"], { tty: false, ...streams }))
  try {
    expect((await mcp.tools()).sort()).toEqual(["amo_read", "amo_tools_search", "amo_write"])
    const doctor = await mcp.call("amo_read", { command: "doctor" })
    expect(doctor.body).toMatchObject({ item: { version: IDENTITY.version } })
  } finally {
    expect(await mcp.close()).toBe(0)
  }
})

it("pins this CLI's own commands an agent can find, as reads or writes", async () => {
  const program = createProgram()
  const options = {
    includeUnavailable: true,
    exclude: [["mcp"]],
    authority: changesAuthorityAt(program),
    fetchOnly: readsOverMcpAt(program),
    permissions,
  }
  await expect(`${JSON.stringify(ownCatalogue(program, options), null, 2)}\n`).toMatchFileSnapshot(
    "../contracts/mcp-catalogue.json",
  )
})

it("mcp serve refuses a --permission that names no command, and a --profiles this computer lacks", async () => {
  const unknown = await amo(["work", "mcp", "serve", "--permission", "sessions.nope=deny"])
  expect(unknown.code).toBe(2)
  expect(unknown.err).toContain("sessions.nope")
  const missing = await amo(["mcp", "serve", "--profiles", "nope"])
  expect(missing.code).toBe(2)
  expect(missing.err).toContain("nope")
})

it("mcp config prints an entry that serves the named profile, or every profile only when told", async () => {
  const one = await amo(["work", "mcp", "config", "--permission", "api.leads=readonly", "--json"])
  const entry = one.json().item as { config: { mcpServers: Record<string, { args: string[] }> } }
  expect(entry.config.mcpServers["amo-work"]?.args.slice(-5)).toEqual([
    "work",
    "mcp",
    "serve",
    "--permission",
    "api.leads=readonly",
  ])
  const all = await amo(["mcp", "config", "--profiles", "all", "--json"])
  expect(JSON.stringify(all.json())).toContain('"--profiles","all"')
})

it("mcp revoke answers for the profile it names", async () => {
  const revoked = await amo(["work", "mcp", "revoke", "--json"])
  expect(revoked.code).toBe(0)
  expect(revoked.json().item).toMatchObject({ profile: "work" })
})

it("doctor --online answers even when npm cannot be reached", async () => {
  const online = await amo(["doctor", "--online", "--json"])
  expect(online.code).toBe(0)
  expect(online.json().item).toMatchObject({ version: IDENTITY.version, online: expect.any(Object) })
})

it("a denied command is offered as unavailable and refused before any request (WC-PERM-23)", async () => {
  const file = join(process.env.AMO_CONFIG_DIR ?? "", "config.json")
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, JSON.stringify({ profiles: { work: { permissions: { "deals.list": "deny" } } } }))
  const account = fakeAmo()
  const options: RunOptions & AmoEnvironment = { tty: false, keyring: signedIn(), fetch: account.fetch }
  const mcp = await mcpOverStdio((streams) => run(["work", "mcp", "serve"], { ...options, ...streams }))
  try {
    const found = await mcp.call("amo_tools_search", { query: "deals list" })
    expect(found.body).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ command: "deals list", availability: expect.objectContaining({ available: false }) }),
      ]),
    })
    const listed = await mcp.call("amo_read", { command: "deals list" })
    expect(listed.isError).toBe(true)
    expect(JSON.stringify(listed.body)).toContain("permission_error")
    expect(account.calls).toEqual([])
  } finally {
    expect(await mcp.close()).toBe(0)
    rmSync(file, { force: true })
  }
})
