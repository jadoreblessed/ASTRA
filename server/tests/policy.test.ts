import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkBasketShape,
  checkBudget,
  checkFresh,
  checkOrderSize,
  checkSlippage,
  checkTrading,
  splitByWeight,
  type Limits,
} from "../src/policy/engine.ts";

const L: Limits = {
  tradingEnabled: true,
  maxTotalSpendLamports: 50_000_000,
  maxOrderUsd: 5,
  maxSlippageBps: 100,
  priceMaxAgeSec: 120,
  maxBasketAssets: 14,
};

test("trading switch", () => {
  assert.equal(checkTrading(L).ok, true);
  assert.equal(checkTrading({ ...L, tradingEnabled: false }).ok, false);
});

test("budget never lets total spend pass 0.05 SOL", () => {
  assert.equal(checkBudget(L, 0, 2_000_000).ok, true);
  assert.equal(checkBudget(L, 49_000_000, 1_000_000).ok, true);
  assert.equal(checkBudget(L, 49_000_000, 1_000_001).ok, false);
});

test("order size", () => {
  assert.equal(checkOrderSize(L, 5).ok, true);
  assert.equal(checkOrderSize(L, 5.01).ok, false);
  assert.equal(checkOrderSize(L, 0).ok, false);
  assert.equal(checkOrderSize(L, Number.NaN).ok, false);
});

test("slippage", () => {
  assert.equal(checkSlippage(L, 50).ok, true);
  assert.equal(checkSlippage(L, 101).ok, false);
  assert.equal(checkSlippage(L, 0).ok, false);
});

test("price freshness", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  assert.equal(checkFresh(L, new Date("2026-10-28T11:59:00Z"), now).ok, true);
  assert.equal(checkFresh(L, new Date("2026-10-28T11:57:00Z"), now).ok, false);
  assert.equal(checkFresh(L, null, now).ok, false);
});

test("basket shape", () => {
  assert.equal(checkBasketShape(L, [{ symbol: "A", weight_bps: 6000 }, { symbol: "B", weight_bps: 4000 }]).ok, true);
  assert.equal(checkBasketShape(L, [{ symbol: "A", weight_bps: 6000 }]).ok, false);
  assert.equal(checkBasketShape(L, [{ symbol: "A", weight_bps: 5000 }, { symbol: "A", weight_bps: 5000 }]).ok, false);
  const fifteen = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}`, weight_bps: i < 14 ? 667 : 662 }));
  assert.equal(checkBasketShape(L, fifteen).ok, false);
});

test("split keeps every base unit", () => {
  const legs = splitByWeight(1_000_001n, [3333, 3333, 3334]);
  assert.equal(legs.reduce((s, x) => s + x, 0n), 1_000_001n);
  assert.ok(legs.every((x) => x > 0n));
});
