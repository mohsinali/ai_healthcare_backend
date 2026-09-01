/**
 * Full-string normalized Levenshtein similarity.
 *
 * similarity = 1 - distance(left, right) / max(left.length, right.length)
 *
 * Two empty strings are identical (1). An empty and a non-empty string have
 * similarity 0. Short names receive no special allowance: one edit in a
 * two-character name scores 0.5, which intentionally does not pass 0.85.
 */
export function patientNameSimilarity(left: string, right: string): number {
  const longestLength = Math.max(left.length, right.length);
  if (longestLength === 0) return 1;
  return 1 - levenshteinDistance(left, right) / longestLength;
}

function levenshteinDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}
