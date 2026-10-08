import type { QuizQuestion } from "../../app-types";
import type { ReadingQuestion, StudyDocument, StudyProgress, VocabularyItem } from "../../types";
import { escapeRegExp, shuffle } from "../../lib/app-utils";

export const MAX_COMPREHENSION_GENERATION_COUNT = 10;
export const MAX_CLOZE_GENERATION_COUNT = 20;

export const normalizeQuestionText = (value: string) => typeof value === "string"
  ? value.normalize("NFKC").toLowerCase().replace(/_{3,}/g, " blank ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()
  : "";

export function distinctAlternatives(values: string[], answer: string): string[] {
  const seen = new Set([normalizeQuestionText(answer)]);
  return values.filter((value) => {
    const key = normalizeQuestionText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function uniqueQuizQuestions(questions: QuizQuestion[], options: { preserveWordEntries?: boolean } = {}): QuizQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    const key = options.preserveWordEntries && "wordId" in question && question.wordId
      ? `word:${question.wordId}`
      : question.kind === "flashcard"
      ? `${normalizeQuestionText(question.front)}:${normalizeQuestionText(question.back)}`
      : question.kind === "ordering" ? `ordering:${question.sentenceId}` : normalizeQuestionText(question.prompt);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const mergeUniqueQuestions = (existing: ReadingQuestion[], incoming: ReadingQuestion[]) => {
  const seen = new Set(existing.map((question) => normalizeQuestionText(question.question)));
  return [...existing, ...incoming.filter((question) => {
    if (!Array.isArray(question.options) || question.options.length < 2 || !question.options.every((option) => typeof option === "string" && option.trim()) || !Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) return false;
    const key = normalizeQuestionText(question.question);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
};

export const createLocalComprehensionQuestions = (doc: StudyDocument, count: number) => {
  const sentences = doc.analysis.sentences.filter((sentence) => sentence.english && sentence.korean);
  if (sentences.length < 4) return [];
  return shuffle(sentences).slice(0, count).map((sentence): ReadingQuestion => {
    const alternatives = shuffle(distinctAlternatives(sentences.filter((item) => item.id !== sentence.id).map((item) => item.korean), sentence.korean)).slice(0, 3);
    const options = shuffle([sentence.korean, ...alternatives]);
    return { question: `다음 문장의 올바른 해석은?\n${sentence.english}`, options, answer: options.indexOf(sentence.korean), explanation: sentence.korean };
  });
};

export const createAdditionalClozeQuestions = (doc: StudyDocument, words: VocabularyItem[], count: number) => {
  const existing = new Set((doc.analysis.cloze_questions ?? []).map((question) => normalizeQuestionText(question.question)));
  // Saved vocabulary already produces these blanks in the cloze quiz.
  for (const word of words) {
    const prompt = word.source_sentence.replace(new RegExp(`\\b${escapeRegExp(word.word)}\\b`, "i"), "______");
    if (prompt !== word.source_sentence) existing.add(normalizeQuestionText(prompt));
  }
  const allTerms = [...new Set([
    ...doc.analysis.sentences.flatMap((sentence) => sentence.keywords.map((keyword) => keyword.word.trim())),
    ...words.map((word) => word.word.trim()),
  ].filter(Boolean))];
  const candidates = shuffle(doc.analysis.sentences.flatMap((sentence) => {
    const terms = [
      ...sentence.keywords.map((keyword) => ({ word: keyword.word, meaning: keyword.meaning })),
      ...words.filter((word) => word.sentence_id === sentence.id).map((word) => ({ word: word.word, meaning: word.meaning })),
    ];
    return terms.map((term) => ({ sentence, ...term }));
  }));
  const created: ReadingQuestion[] = [];
  for (const candidate of candidates) {
    const expression = new RegExp(`\\b${escapeRegExp(candidate.word)}\\b`, "i");
    const prompt = candidate.sentence.english.replace(expression, "______");
    const key = normalizeQuestionText(prompt);
    if (prompt === candidate.sentence.english || existing.has(key) || created.some((question) => normalizeQuestionText(question.question) === key)) continue;
    const alternatives = shuffle(distinctAlternatives(allTerms, candidate.word)).slice(0, 3);
    if (alternatives.length < 3) continue;
    const options = shuffle([candidate.word, ...alternatives]);
    created.push({ question: prompt, options, answer: options.indexOf(candidate.word), explanation: `${candidate.word} — ${candidate.meaning}` });
    if (created.length >= count) break;
  }
  return created;
};

export const missedComprehensionKey = "__missed_comprehension_question_ids";
export const readMissedComprehensionIds = (progress: StudyProgress, questionCount: number) => {
  try {
    const parsed = JSON.parse(progress.sentence_notes?.[missedComprehensionKey] ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id) && id >= 0 && id < questionCount) : [];
  } catch {
    return [];
  }
};
