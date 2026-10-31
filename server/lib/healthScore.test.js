import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHealthScore } from '../lib/healthScore.js';

// ── helpers ──────────────────────────────────────────────────

/** Shorthand: all inputs default to "perfectly healthy" values. */
const score = (overrides = {}) =>
  computeHealthScore({
    lastMergedPrDays: 0,   // recency  → 40
    responseHours: 0,      // responsiveness → 30
    mergedPrs30d: 20,      // activity → 20
    hasContributing: true,  // guide   → 10
    ...overrides,
  });

// ── individual sub-score ranges ──────────────────────────────

test('recency: 0 days → 40, 20 days → 20, 40+ days → 0', () => {
  assert.equal(score({ lastMergedPrDays: 0 }), 100);   // recency = 40
  assert.equal(score({ lastMergedPrDays: 20 }), 80);    // recency = 20
  assert.equal(score({ lastMergedPrDays: 40 }), 60);    // recency = 0
  assert.equal(score({ lastMergedPrDays: 100 }), 60);   // recency clamped to 0
});

test('responsiveness: 0 h → 30, 30 h → 15, 60 h → 0, huge → 0', () => {
  assert.equal(score({ responseHours: 0 }), 100);       // resp = 30
  assert.equal(score({ responseHours: 30 }), 85);       // resp = 15
  assert.equal(score({ responseHours: 60 }), 70);       // resp = 0
  assert.equal(score({ responseHours: 200 }), 70);      // resp clamped to 0, NOT negative
  assert.equal(score({ responseHours: 10000 }), 70);    // resp clamped to 0
});

test('guide: 10 when present, 0 when absent', () => {
  assert.equal(score({ hasContributing: true }), 100);
  assert.equal(score({ hasContributing: false }), 90);
});

test('activity: mergedPrs30d capped at 20', () => {
  assert.equal(score({ mergedPrs30d: 0 }), 80);         // activity = 0
  assert.equal(score({ mergedPrs30d: 10 }), 90);        // activity = 10
  assert.equal(score({ mergedPrs30d: 20 }), 100);       // activity = 20
  assert.equal(score({ mergedPrs30d: 100 }), 100);      // clamped to 20
  assert.equal(score({ mergedPrs30d: 9999 }), 100);     // clamped to 20
});

// ── total score boundaries ───────────────────────────────────

test('perfect inputs → exactly 100', () => {
  assert.equal(score(), 100);
});

test('worst-case inputs → exactly 0', () => {
  assert.equal(
    score({
      lastMergedPrDays: 999,
      responseHours: 9999,
      mergedPrs30d: 0,
      hasContributing: false,
    }),
    0,
  );
});

test('total is always between 0 and 100 (property check)', () => {
  const extremes = [
    { lastMergedPrDays: -10, responseHours: -50, mergedPrs30d: 500, hasContributing: true },
    { lastMergedPrDays: 0, responseHours: 0, mergedPrs30d: 0, hasContributing: false },
    { lastMergedPrDays: 1000, responseHours: 5000, mergedPrs30d: 0, hasContributing: false },
    { lastMergedPrDays: 0, responseHours: 0, mergedPrs30d: 9999, hasContributing: true },
  ];
  for (const input of extremes) {
    const s = computeHealthScore(input);
    assert.ok(s >= 0 && s <= 100, `score ${s} is out of [0, 100] for ${JSON.stringify(input)}`);
  }
});

// ── "normal" scoring sanity checks ──────────────────────────

test('a moderately healthy repo gets a reasonable mid-range score', () => {
  const s = score({
    lastMergedPrDays: 10,  // recency = 30
    responseHours: 20,     // resp = 20
    mergedPrs30d: 8,       // activity = 8
    hasContributing: true,  // guide = 10
  });
  // 30 + 20 + 10 + 8 = 68
  assert.equal(s, 68);
});

test('a stale but well-documented repo still scores > 0', () => {
  const s = score({
    lastMergedPrDays: 365,
    responseHours: 200,
    mergedPrs30d: 0,
    hasContributing: true,
  });
  // recency 0, resp 0, guide 10, activity 0 → 10
  assert.equal(s, 10);
});

// ── regression: the bugs that prompted this fix ──────────────

test('BUG FIX: very slow response cannot produce a negative score', () => {
  const s = score({ responseHours: 1000 });
  assert.ok(s >= 0, `score was ${s}, must be ≥ 0`);
});

test('BUG FIX: many merged PRs cannot push the score above 100', () => {
  const s = score({ mergedPrs30d: 500 });
  assert.ok(s <= 100, `score was ${s}, must be ≤ 100`);
});

