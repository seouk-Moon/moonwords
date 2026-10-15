import type { VocabularyItem } from "../../types";

export function readWordSources(note: string | null | undefined): string[] {
  return [...new Set((note ?? "").split(/\r?\n/).flatMap((line) => {
    const title = line.match(/^\s*원본\s*본문\s*:\s*(.+?)\s*$/)?.[1];
    return title ? [title] : [];
  }))];
}

const normalizeSentence = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function questionWordSources(question: { wordId?: string; sentenceId?: number; sourceSentence?: string }, words: VocabularyItem[]): string[] {
  const candidates = question.wordId ? words.filter((word) => word.id === question.wordId)
    : question.sentenceId !== undefined ? words.filter((word) => word.sentence_id === question.sentenceId)
    : question.sourceSentence ? words.filter((word) => normalizeSentence(word.source_sentence) === normalizeSentence(question.sourceSentence!)) : [];
  return [...new Set(candidates.flatMap((word) => readWordSources(word.note)))];
}
