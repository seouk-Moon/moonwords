import type { QuizMode, QuizQuestion } from "../../app-types";
import type { StudyProgress, VocabularyItem } from "../../types";

export const studySettingsKey = "__moonwords_study_sets_v1";
export type StudySettings = {
  setSize: number;
  setSizeUpdatedAt?: string;
  starred: string[];
  important: string[];
  incorrect: string[];
};
const sizeCacheKey = (progress: StudyProgress) => `moonwords:word-set-size:${progress.user_id}:${progress.document_id}`;
const validSize = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 500;
function cachedSize(progress: StudyProgress): { setSize: number; updatedAt: string } | null {
  try {
    if (typeof window === "undefined") return null;
    const cached = JSON.parse(window.localStorage.getItem(sizeCacheKey(progress)) ?? "null");
    return validSize(cached?.setSize) && Number.isFinite(Date.parse(cached?.updatedAt)) ? cached : null;
  } catch { return null; }
}
export function setVocabularySetSize(progress: StudyProgress, size: number): StudyProgress {
  const settings = readStudySettings(progress);
  const setSize = Math.min(500, Math.max(1, Math.trunc(size) || 1));
  const updatedAt = new Date(Math.max(Date.now(), (Date.parse(settings.setSizeUpdatedAt ?? "") || 0) + 1)).toISOString();
  try { if (typeof window !== "undefined") window.localStorage.setItem(sizeCacheKey(progress), JSON.stringify({ setSize, updatedAt })); } catch { /* cloud save still works */ }
  return writeStudySettings(progress, { ...settings, setSize, setSizeUpdatedAt: updatedAt });
}
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
export function readStudySettings(progress: StudyProgress): StudySettings {
  try {
    const saved = JSON.parse(progress.sentence_notes?.[studySettingsKey] ?? "{}");
    const cached = cachedSize(progress);
    const cacheIsNewer = cached && Date.parse(cached.updatedAt) > (Date.parse(saved?.setSizeUpdatedAt) || 0);
    const timestamp = cacheIsNewer ? cached.updatedAt : saved?.setSizeUpdatedAt;
    return {
      ...(typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp)) ? { setSizeUpdatedAt: timestamp } : {}),
      setSize: cacheIsNewer ? cached.setSize : Number.isInteger(saved?.setSize) && saved.setSize >= 1 && saved.setSize <= 500 ? saved.setSize : 10,
      starred: strings(saved?.starred), important: strings(saved?.important), incorrect: strings(saved?.incorrect),
    };
  } catch { const cached = cachedSize(progress); return { setSize: cached?.setSize ?? 10, ...(cached ? { setSizeUpdatedAt: cached.updatedAt } : {}), starred: [], important: [], incorrect: [] }; }
}
export function writeStudySettings(progress: StudyProgress, settings: StudySettings): StudyProgress {
  return { ...progress, sentence_notes: { ...progress.sentence_notes, [studySettingsKey]: JSON.stringify(settings) }, last_studied_at: new Date().toISOString() };
}
export function toggleStudyMark(progress: StudyProgress, key: string, mark: "starred" | "important"): StudyProgress {
  const settings = readStudySettings(progress);
  return writeStudySettings(progress, { ...settings, [mark]: settings[mark].includes(key) ? settings[mark].filter((item) => item !== key) : [...settings[mark], key] });
}
export function recordStudyOutcome(progress: StudyProgress, key: string, correct: boolean): StudyProgress {
  const settings = readStudySettings(progress);
  return writeStudySettings(progress, { ...settings, incorrect: correct ? settings.incorrect.filter((item) => item !== key) : [...new Set([...settings.incorrect, key])] });
}
export const wordStudyKey = (id: string) => `word:${id}`;
export function quizStudyKey(mode: QuizMode, question: QuizQuestion): string {
  if ("wordId" in question && question.wordId) return wordStudyKey(question.wordId);
  if (question.kind === "ordering") return `ordering:${question.sentenceId}`;
  return `${mode}:${"prompt" in question ? question.prompt : question.front}`;
}
export function buildVocabularySets<T extends Pick<VocabularyItem, "id" | "created_at">>(words: T[], size: number): T[][] {
  const ordered = [...words].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const count = Number.isInteger(size) && size > 0 ? size : 10;
  return Array.from({ length: Math.ceil(ordered.length / count) }, (_, index) => ordered.slice(index * count, (index + 1) * count));
}
