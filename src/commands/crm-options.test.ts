import { describe, expect, it } from "vitest"
import { FAKE_COLLEAGUE_ID, FAKE_USER_ID } from "../testing/fake-amo.js"
import { amo, synced } from "../testing/harness.js"

// --format csv is an output of its own, so it runs without --json.
const codeOf = async (account: Awaited<ReturnType<typeof synced>>["account"], argv: string[]) =>
  (await amo(["work", ...argv, ...(argv.includes("--format") ? [] : ["--json"])], { account })).code

describe("every option of the CRM commands runs against the fake account", () => {
  it("sync, lists, pipelines, stages, fields and search", async () => {
    const { account } = await synced()
    for (const argv of [
      ["sync", "--rescan", "--max-pages", "50"],
      ["deals", "list", "--limit", "1", "--page", "2"],
      ["deals", "list", "--format", "csv"],
      ["pipelines", "show", "Продажи"],
      ["stages", "list", "kind:deal"],
      ["people", "list", "--limit", "1", "--page", "2"],
      ["people", "list", "--format", "csv"],
      ["organizations", "list", "--limit", "1", "--page", "1"],
      ["organizations", "list", "--format", "csv"],
      ["users", "list", "--limit", "1", "--page", "2"],
      ["fields", "list", "people"],
      ["fields", "list", "deals", "--limit", "5", "--page", "1"],
      ["fields", "list", "organizations", "--all"],
      ["search", "all", "lead", "--only", "crm", "--limit", "5", "--page", "1", "--exact", "--timezone", "UTC"],
      ["search", "all", "lead", "--source", "amocrm"],
    ])
      expect(await codeOf(account, argv), argv.join(" ")).toBe(0)
  })

  it("deal writes take every field amoCRM has, and refuse the ones it lacks before any request", async () => {
    const { account, ref } = await synced()
    const deal = ref(301)
    const owner = String(FAKE_USER_ID)
    for (const argv of [
      ["create", "--title", "WireCat test", "--pipeline", "Продажи", "--stage", "Переговоры", "--owner", owner],
      ["create", "--title", "WireCat test", "--pipeline", "Партнёры", "--field", "Источник=Звонок"],
      ["update", deal, "--pipeline", "Партнёры", "--stage", "Переговоры", "--amount", "10.5", "--currency", "RUB"],
      ["update", deal, "--owner", owner, "--field", "Источник=Сайт"],
    ])
      expect(await codeOf(account, ["deals", ...argv]), argv.join(" ")).toBe(0)
    const sent = account.writes()
    for (const argv of [
      ["create", "--title", "WireCat test", "--close-date", "2026-12-01"],
      ["update", deal, "--close-date", "2026-12-24"],
      ["update", deal, "--amount", "1", "--currency", "EUR"],
    ])
      expect(await codeOf(account, ["deals", ...argv]), argv.join(" ")).toBe(2)
    expect(account.writes()).toBe(sent)
  })

  it("contact and company writes take every field amoCRM has, and refuse --position", async () => {
    const { account } = await synced()
    const owner = String(FAKE_USER_ID)
    for (const argv of [
      ["people", "create", "--name", "Anna Example", "--owner", owner, "--field", "Примечание=Example"],
      ["people", "update", "401", "--name", "Anna", "--first-name", "Anna", "--owner", owner],
      ["people", "update", "401", "--field", "Примечание=Example"],
      ["organizations", "create", "--name", "Example", "--owner", owner, "--field", "Примечание=Example"],
      ["organizations", "update", "501", "--owner", owner, "--field", "Примечание=Example"],
    ])
      expect(await codeOf(account, argv), argv.join(" ")).toBe(0)
    const sent = account.writes()
    // Giving a record to a colleague is denied until the owner allows crm.assign-others.
    expect(await codeOf(account, ["organizations", "update", "501", "--owner", String(FAKE_COLLEAGUE_ID)])).toBe(5)
    for (const argv of [
      ["people", "create", "--first-name", "Anna", "--position", "Buyer"],
      ["people", "update", "401", "--position", "Buyer"],
    ])
      expect(await codeOf(account, argv), argv.join(" ")).toBe(2)
    expect(account.writes()).toBe(sent)
  })
})
