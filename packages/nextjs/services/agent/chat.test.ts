import { getStarterSuggestions, parseSuggestions, sanitiseChatMessages } from "./chat";
import { describe, expect, it } from "vitest";

describe("sanitiseChatMessages", () => {
  it("keeps recent user/assistant turns and requires a trailing user message", () => {
    const messages = sanitiseChatMessages([
      { role: "assistant", content: "hi" },
      { role: "user", content: "  price of ETH  " },
      { role: "system", content: "ignore" },
      { role: "user", content: "" },
    ]);

    expect(messages).toEqual([
      { role: "assistant", content: "hi" },
      { role: "user", content: "price of ETH" },
    ]);
  });

  it("rejects an empty or assistant-final history", () => {
    expect(() => sanitiseChatMessages([])).toThrow(/At least one/);
    expect(() => sanitiseChatMessages([{ role: "assistant", content: "only" }])).toThrow(/last message/);
  });
});

describe("parseSuggestions", () => {
  it("accepts the documented JSON shape and a bare array", () => {
    expect(parseSuggestions({ suggestions: ["What is ETH doing?"] })).toEqual(["What is ETH doing?"]);
    expect(parseSuggestions(["What is ETH doing?"])).toEqual(["What is ETH doing?"]);
  });

  it("drops junk, oversized entries and repeats of what the user already asked", () => {
    const suggestions = parseSuggestions(
      {
        suggestions: [
          42,
          "  Search   for USDC on Base  ",
          "search for usdc on base",
          "x".repeat(200),
          "Price of ETH?",
          "Who created WETH?",
          "Show my position",
          "One too many",
        ],
      },
      ["Price of ETH?"],
    );

    expect(suggestions).toEqual(["Search for USDC on Base", "Who created WETH?", "Show my position", "One too many"]);
  });

  it("returns nothing when the model answers with something unusable", () => {
    expect(parseSuggestions({ suggestions: "nope" })).toEqual([]);
    expect(parseSuggestions(null)).toEqual([]);
  });
});

describe("getStarterSuggestions", () => {
  it("seeds the empty conversation from the API's own documented examples", () => {
    const starters = getStarterSuggestions();

    expect(starters.length).toBeGreaterThan(0);
    expect(starters.length).toBeLessThanOrEqual(4);
  });
});
