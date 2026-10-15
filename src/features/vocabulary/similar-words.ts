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

const partOfSpeech = /^(?:n|v|vt|vi|a|adj|adv|ad|prep|pron|conj|det|art|int|interj|aux|modal|phr|noun|verb|adjective|adverb|preposition|pronoun|conjunction|article|determiner|interjection|auxiliary|명|명사|대명사|동|동사|자동사|타동사|형|형용사|부|부사|전치사|접속사|관사|감탄사|조동사|한정사)\.?$/i;

export function normalizeVocabularyWord(value: string): string {
  let text = value.normalize("NFKC").toLowerCase().replace(/[‘’]/g, "'").trim();
  // Remove only recognized POS annotations; keep other parenthetical content.
  text = text.replace(/\(([^()]*)\)|\[([^\[\]]*)\]|【([^】]*)】/g, (annotation, ...groups) => {
    const content = (groups.slice(0, 3).find((group) => typeof group === "string") ?? "") as string;
    const labels = content.trim().split(/[\s,;/·&+|]+/).filter(Boolean);
    return labels.length && labels.every((label) => partOfSpeech.test(label)) ? " " : annotation;
  });
  text = text.replace(/(^|[\s,;:])(?:n|v|vt|vi|a|adj|adv|ad|prep|pron|conj|det|art|int|interj|aux|modal|phr)\.(?=\s|$)/g, " ");
  text = text.replace(/^(?:명사|대명사|동사|자동사|타동사|형용사|부사|전치사|접속사|관사|감탄사|조동사|한정사)\s+|\s+(?:명사|대명사|동사|자동사|타동사|형용사|부사|전치사|접속사|관사|감탄사|조동사|한정사)$/g, " ");
  return text.replace(/\s+/g, " ").replace(/^[,;:\s]+|[,;:\s]+$/g, "").trim();
}

// Group identical vocabulary keys instead of matching partial spellings.
export function findSimilarWords(words: VocabularyItem[]): SimilarWordGroup[] {
  const entries = new Map<string, VocabularyItem[]>();
  words.forEach((word) => {
    const key = normalizeVocabularyWord(word.word);
    if (!key) return;
    const group = entries.get(key);
    if (group) group.push(word);
    else entries.set(key, [word]);
  });
  return [...entries].filter(([, items]) => items.length > 1).map(([sharedText, words]) => ({ sharedText, words }));
}
