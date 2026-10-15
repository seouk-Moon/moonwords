import type { DocumentAnalysis, VocabularyItem } from "../../types";
import { commonEnglishWords } from "./common-english-words";

export type SuggestedWord = { word: string; meaning: string; sentenceId: number; sourceSentence: string; translation: string };

const advancedExpressions = new Set([
  "take for granted", "come to terms with", "at odds with", "give rise to",
  "shed light on", "in the wake of", "on the verge of", "by virtue of",
  "call into question", "fall short of", "in lieu of", "insofar as",
]);

const normalize = (word: string) => word.normalize("NFKC").toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

function isCommonWord(word: string): boolean {
  if (commonEnglishWords.has(word)) return true;
  // Do not promote a familiar word just because its inflection is less frequent.
  const bases = new Set<string>();
  if (word.endsWith("ies") || word.endsWith("ied")) bases.add(word.slice(0, -3) + "y");
  if (word.endsWith("s")) bases.add(word.slice(0, -1));
  if (word.endsWith("es")) bases.add(word.slice(0, -2));
  for (const suffix of ["ing", "ed"]) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    bases.add(stem); bases.add(stem + "e");
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) bases.add(stem.slice(0, -1));
  }
  return [...bases].some((base) => base.length >= 3 && commonEnglishWords.has(base));
}

export function shouldRecommendWord(value: string): boolean {
  const key = normalize(value);
  if (advancedExpressions.has(key)) return true;
  if (!/^[a-z]+(?:[' -][a-z]+)*$/.test(key) || /^[A-Z]{2,}$/.test(value.trim())) return false;
  const tokens = key.split(/[ '-]+/);
  // Familiar multiword expressions do not become difficult just by being long.
  return tokens.some((token) => token.length >= 3 && !isCommonWord(token));
}

export function collectSuggestedWords(sentences: DocumentAnalysis["sentences"], words: VocabularyItem[], sentenceIds?: Set<number>): SuggestedWord[] {
  const seen = new Set<string>();
  const saved = new Set(words.map((item) => normalize(item.word)));
  return sentences.flatMap((sentence) => {
    if (sentenceIds && !sentenceIds.has(sentence.id)) return [];
    return sentence.keywords.flatMap((keyword): SuggestedWord[] => {
      const key = normalize(keyword.word);
      if (!key || !keyword.meaning.trim() || seen.has(key) || saved.has(key) || !shouldRecommendWord(keyword.word)) return [];
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      if (!new RegExp(`\\b${escaped}\\b`, "i").test(normalize(sentence.english))) return [];
      seen.add(key);
      return [{ word: keyword.word, meaning: keyword.meaning, sentenceId: sentence.id, sourceSentence: sentence.english, translation: sentence.korean }];
    });
  });
}
