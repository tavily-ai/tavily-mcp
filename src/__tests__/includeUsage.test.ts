import test from "node:test";
import assert from "node:assert/strict";

process.env.TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "test-key";
process.env.TAVILY_MCP_SKIP_RUN = "true";

const clientModulePromise = import("../index.js");

async function createMockedClient() {
  const { TavilyClient } = await clientModulePromise;
  const client = new TavilyClient();
  const calls: any[] = [];

  client.setHttpClient({
    post: async (_url: string, payload: any) => {
      calls.push(payload);
      return { data: { query: "", results: [] } };
    }
  });

  return { client, calls };
}

test("search omits include_usage by default", async () => {
  const { client, calls } = await createMockedClient();
  await client.search({ query: "tavily" });
  assert.equal("include_usage" in calls[0], false);
});

test("crawl includes include_usage when requested", async () => {
  const { client, calls } = await createMockedClient();
  await client.crawl({ url: "https://example.com" }, true);
  assert.equal(calls[0].include_usage, true);
});
