// Turns raw repo metrics into a 0-100 "health" percentage.
//   recency        up to 40 points  (recently merged PR)
//   responsiveness up to 30 points  (fast maintainer replies)
//   guide          10 points        (CONTRIBUTING.md present)
//   activity       up to 20 points  (merged PRs in the last 30 days)

/** Clamp a value to [min, max]. */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function computeHealthScore({ lastMergedPrDays, responseHours, mergedPrs30d, hasContributing }) {
  const recency        = clamp(40 - lastMergedPrDays, 0, 40);
  const responsiveness = clamp(30 - responseHours / 2, 0, 30);
  const guide          = hasContributing ? 10 : 0;
  const activity       = clamp(mergedPrs30d, 0, 20);
  return clamp(Math.round(recency + responsiveness + guide + activity), 0, 100);
}
