import type { ReadingQuestion, StudyDocument, StudyProgress, VocabularyItem } from "../../types";
import { escapeRegExp, shuffle } from "../../lib/app-utils";

export const normalizeQuestionText = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

export const mergeUniqueQuestions = (existing: ReadingQuestion[], incoming: ReadingQuestion[]) => {
  const seen = new Set(existing.map((question) => normalizeQuestionText(question.question)));
  return [...existing, ...incoming.filter((question) => {
    const key = normalizeQuestionText(question.question);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return question.options.length >= 2 && question.answer >= 0 && question.answer < question.options.length;
  })];
};

export const createLocalComprehensionQuestions = (doc: StudyDocument, count: number) => {
  const sentences = doc.analysis.sentences.filter((sentence) => sentence.english && sentence.korean);
  if (sentences.length < 4) return [];
  return shuffle(sentences).slice(0, count).map((sentence): ReadingQuestion => {
    const alternatives = shuffle(sentences.filter((item) => item.id !== sentence.id).map((item) => item.korean)).slice(0, 3);
    const options = shuffle([sentence.korean, ...alternatives]);
    return { question: `다음 문장의 올바른 해석은?\n${sentence.english}`, options, answer: options.indexOf(sentence.korean), explanation: sentence.korean };
  });
};

export const createAdditionalClozeQuestions = (doc: StudyDocument, words: VocabularyItem[], count: number) => {
  const existing = new Set((doc.analysis.cloze_questions ?? []).map((question) => normalizeQuestionText(question.question)));
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
    const alternatives = shuffle(allTerms.filter((term) => term.toLowerCase() !== candidate.word.toLowerCase())).slice(0, 3);
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
