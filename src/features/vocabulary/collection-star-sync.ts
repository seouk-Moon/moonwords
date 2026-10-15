import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyDocument, StudyProgress, VocabularyItem } from "../../types";
import { readStudySettings, writeStudySettings } from "./study-sets";

type SourceWord = Pick<VocabularyItem, "id" | "document_id" | "word" | "meaning">;
const key = (word: Pick<SourceWord, "word" | "meaning">) => JSON.stringify([word.word, word.meaning].map((value) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")));

export function inheritSourceStars(progress: StudyProgress, words: VocabularyItem[], sources: SourceWord[], sourceProgress: StudyProgress[]): StudyProgress {
  const marks = new Map(sourceProgress.map((item) => [item.document_id, new Set(readStudySettings(item).starred)]));
  const markedKeys = new Set(sources.filter((word) => marks.get(word.document_id)?.has(`word:${word.id}`)).map(key));
  const settings = readStudySettings(progress);
  const starred = new Set(settings.starred);
  for (const word of words) if (markedKeys.has(key(word))) starred.add(`word:${word.id}`);
  return starred.size === settings.starred.length ? progress : writeStudySettings(progress, { ...settings, starred: [...starred] });
}

export async function loadSourceStars(client: SupabaseClient, userId: string, doc: StudyDocument, words: VocabularyItem[], progress: StudyProgress): Promise<StudyProgress> {
  const ids = [...new Set(doc.analysis.collection?.sourceDocumentIds ?? [])].filter((id) => id !== doc.id);
  if (!ids.length || !words.length) return progress;
  const sourceProgress: StudyProgress[] = [];
  const sources: SourceWord[] = [];
  // Collection creation permits at most 100 direct source documents.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const result = await client.from("study_progress").select("*").eq("user_id", userId).in("document_id", batch);
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data ?? []) as StudyProgress[];
    sourceProgress.push(...rows);
    const wordIds = [...new Set(rows.flatMap((row) => readStudySettings(row).starred.filter((mark) => /^word:[0-9a-f-]{36}$/i.test(mark)).map((mark) => mark.slice(5))))];
    for (let index = 0; index < wordIds.length; index += 200) {
      const fetched = await client.from("vocabulary").select("id,document_id,word,meaning").eq("user_id", userId).in("document_id", batch).in("id", wordIds.slice(index, index + 200));
      if (fetched.error) throw new Error(fetched.error.message);
      sources.push(...(fetched.data ?? []) as SourceWord[]);
    }
  }
  return inheritSourceStars(progress, words, sources, sourceProgress);
}
