import type { VocabularyItem } from "../../types";

export type SimilarWordGroup = { sharedText: string; words: VocabularyItem[] };
export type SimilarWordPair = { key: string; sharedText: string; words: [VocabularyItem, VocabularyItem] };

// Yield pairs only as they are requested, including each pair just once.
export function* similarWordPairs(groups: SimilarWordGroup[]): Generator<SimilarWordPair> {
  const seen = new Set<string>();
  for (const group of groups) {
    for (let i = 0; i < group.words.length - 1; i++) {
      for (let j = i + 1; j < group.words.length; j++) {
        const words: [VocabularyItem, VocabularyItem] = [group.words[i], group.words[j]];
        const key = JSON.stringify(words.map((word) => word.id).sort());
        if (seen.has(key)) continue;
        seen.add(key);
        yield { key, sharedText: group.sharedText, words };
      }
    }
  }
}

// Index four-character fragments rather than comparing every pair of words.
export function findSimilarWords(words: VocabularyItem[]): SimilarWordGroup[] {
  const fragments = new Map<string, number[]>();
  words.forEach((word, index) => {
    const tokens = word.word.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const characters = Array.from(token);
      for (let i = 0; i <= characters.length - 4; i++) seen.add(characters.slice(i, i + 4).join(""));
    }
    for (const fragment of seen) {
      const entries = fragments.get(fragment);
      if (entries) entries.push(index);
      else fragments.set(fragment, [index]);
    }
  });
  const groups: SimilarWordGroup[] = [];
  const seenGroups = new Set<string>();
  for (const [sharedText, indices] of fragments) {
    if (indices.length < 2) continue;
    const key = indices.join(",");
    if (seenGroups.has(key)) continue;
    seenGroups.add(key);
    groups.push({ sharedText, words: indices.map((index) => words[index]) });
  }
  return groups;
}
