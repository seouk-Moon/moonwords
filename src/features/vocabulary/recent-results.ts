import type { StudyProgress } from "../../types";

export const wordQuizRecentResultsKey = "__moonwords_word_quiz_recent_v1";

export type WordQuizRecentResults = Record<string, boolean[]>;

export function readWordQuizRecentResults(progress: StudyProgress): WordQuizRecentResults {
  const raw = progress.sentence_notes?.[wordQuizRecentResultsKey];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([wordId, values]) => [
        wordId,
        Array.isArray(values)
          ? values.filter((value): value is boolean => typeof value === "boolean").slice(-10)
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

export function appendWordQuizResult(
  progress: StudyProgress,
  wordId: string,
  correct: boolean,
): StudyProgress {
  const current = readWordQuizRecentResults(progress);
  const nextWordResults = [...(current[wordId] ?? []), correct].slice(-10);
  const next: WordQuizRecentResults = { ...current, [wordId]: nextWordResults };

  return {
    ...progress,
    sentence_notes: {
      ...(progress.sentence_notes ?? {}),
      [wordQuizRecentResultsKey]: JSON.stringify(next),
    },
    last_studied_at: new Date().toISOString(),
  };
}

export function summarizeRecentResults(results: boolean[] | undefined) {
  const recent = (results ?? []).slice(-10);
  const correct = recent.filter(Boolean).length;
  return {
    total: recent.length,
    correct,
    incorrect: recent.length - correct,
  };
}
