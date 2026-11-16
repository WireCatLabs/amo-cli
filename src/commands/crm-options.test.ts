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
      ["pipelines", "show", "Продажи", "--since-time", "2026-01-01", "--until-time", "2026-12-31"],
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

  it("changes list pages with --limit and --cursor, and prints a page as csv", async () => {
    const { account } = await synced()
    const first = await amo(["work", "changes", "list", "at>=3650d", "--limit", "1", "--json"], { account })
    expect(first.code).toBe(0)
    const next = (first.json().page as { next_cursor?: string } | undefined)?.next_cursor
    expect(next).toEqual(expect.any(String))
    const second = ["changes", "list", "at>=3650d", "--limit", "1", "--cursor", String(next)]
    expect(await codeOf(account, second)).toBe(0)
    expect(await codeOf(account, ["changes", "list", "--format", "csv"])).toBe(0)
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
      ["people", "create", "--first-name", "Anna", "--email", "anna@example.test", "--phone", "+7 900 000-00-09"],
      ["people", "update", "401", "--email", "anna@example.test", "--phone", "+7 900 000-00-09"],
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
      // The fake account, as the field table describes, has no phone or e-mail field on companies.
      ["organizations", "create", "--name", "Example", "--email", "office@example.test"],
      ["organizations", "create", "--name", "Example", "--phone", "+7 900 000-00-09"],
      ["organizations", "update", "501", "--email", "office@example.test"],
      ["organizations", "update", "501", "--phone", "+7 900 000-00-09"],
    ])
      expect(await codeOf(account, argv), argv.join(" ")).toBe(2)
    expect(account.writes()).toBe(sent)
  })
})
