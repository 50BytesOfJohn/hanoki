import { describe, expect, it } from "vitest";

import { addResponseCost, parseChatCost } from "./chat-cost";

describe("addResponseCost", () => {
  it("starts a ledger from the first priced response", () => {
    expect(addResponseCost(undefined, { total: 0.5, currency: "USD" })).toEqual({
      total: 0.5,
      currency: "USD",
      pricedResponses: 1,
      unpricedResponses: 0,
    });
  });

  it("sums priced responses and counts unpriced ones", () => {
    let cost = addResponseCost(undefined, { total: 0.25, currency: "USD" });
    cost = addResponseCost(cost, undefined);
    cost = addResponseCost(cost, { input: 0.1, currency: "USD" });
    cost = addResponseCost(cost, { total: 0.5, currency: "USD" });

    expect(cost).toEqual({
      total: 0.75,
      currency: "USD",
      pricedResponses: 2,
      unpricedResponses: 2,
    });
  });

  it("adopts the currency of the first priced response after unpriced ones", () => {
    const cost = addResponseCost(addResponseCost(undefined, undefined), {
      total: 1,
      currency: "EUR",
    });

    expect(cost).toMatchObject({ total: 1, currency: "EUR", unpricedResponses: 1 });
  });

  it("treats a response in another currency as unpriced", () => {
    const cost = addResponseCost(addResponseCost(undefined, { total: 1, currency: "USD" }), {
      total: 2,
      currency: "EUR",
    });

    expect(cost).toEqual({
      total: 1,
      currency: "USD",
      pricedResponses: 1,
      unpricedResponses: 1,
    });
  });
});

describe("parseChatCost", () => {
  it("accepts a stored ledger and rejects malformed values", () => {
    const cost = { total: 1.5, currency: "USD", pricedResponses: 3, unpricedResponses: 0 };

    expect(parseChatCost(cost)).toEqual(cost);
    expect(parseChatCost(undefined)).toBeUndefined();
    expect(parseChatCost({ ...cost, total: "1.5" })).toBeUndefined();
    expect(parseChatCost({ ...cost, pricedResponses: -1 })).toBeUndefined();
  });
});
