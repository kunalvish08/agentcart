import { describe, expect, it } from "vitest";

import { executeTool, TOOL_NAMES } from "./agent-tools.server";

const ctx = { baseUrl: "http://127.0.0.1:9/" }; // unreachable on purpose

describe("controlled tool layer", () => {
  it("exposes exactly the five registered tools", () => {
    expect(TOOL_NAMES).toEqual([
      "search_catalog",
      "get_product",
      "get_related_products",
      "get_quote",
      "get_merchant_info",
    ]);
  });

  it("rejects unregistered tools", async () => {
    const { result } = await executeTool("run_sql", { query: "select 1" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("unknown_tool");
  });

  it("rejects non-JSON arguments", async () => {
    const { result } = await executeTool("get_product", "{not json", ctx);
    expect(result.error?.code).toBe("invalid_tool_arguments");
  });

  it("rejects a non-UUID product_id", async () => {
    const { result } = await executeTool("get_product", { product_id: "'; DROP TABLE" }, ctx);
    expect(result.error?.code).toBe("invalid_tool_arguments");
  });

  it("rejects invalid quote quantities and discounts", async () => {
    const id = "33333333-3333-4333-8333-000000000001";
    for (const args of [
      { product_id: id, quantity: 0 },
      { product_id: id, quantity: 2.5 },
      { product_id: id, quantity: 1_000_000 },
      { product_id: id, quantity: 1, requested_discount_percent: -5 },
      { product_id: id, quantity: 1, requested_discount_percent: 500 },
    ]) {
      const { result } = await executeTool("get_quote", args, ctx);
      expect(result.error?.code).toBe("invalid_tool_arguments");
    }
  });

  it("rejects an empty search query and oversized limits", async () => {
    expect((await executeTool("search_catalog", { query: "" }, ctx)).result.error?.code).toBe(
      "invalid_tool_arguments",
    );
    expect(
      (await executeTool("search_catalog", { query: "laptop", limit: 500 }, ctx)).result.error?.code,
    ).toBe("invalid_tool_arguments");
  });

  it("ignores extra model-invented arguments instead of forwarding them", async () => {
    const { result } = await executeTool(
      "get_merchant_info",
      { merchant_id: "11111111-1111-1111-1111-111111111111", sql: "select *" },
      ctx,
    );
    // Valid arguments, but the API is unreachable in this test: reported, not invented.
    expect(result.ok).toBe(false);
    expect(["tool_unavailable", "tool_timeout"]).toContain(result.error?.code);
  });

  it("reports commerce API failures instead of fabricating data", async () => {
    const { result } = await executeTool("search_catalog", { query: "laptop" }, ctx);
    expect(result.ok).toBe(false);
    expect(["tool_unavailable", "tool_timeout"]).toContain(result.error?.code);
  });
});
