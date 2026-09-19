import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoDocument } from "../demo";
import { supabase } from "../lib/supabase";
import { clearAuthParamsFromUrl } from "../lib/auth-url";
import { uid } from "../lib/app-utils";
import { normalizeCefrLevel } from "../lib/cefr";
import type { View } from "../app-types";
import type { DocumentFolder, StudyDocument, StudyProgress, VocabularyItem } from "../types";
import { appendWordQuizResult } from "../features/vocabulary/recent-results";
import { useLearningAnalytics } from "./useLearningAnalytics";
import type { QuizMode } from "../app-types";

const createDemoProgress = (): StudyProgress => ({
  user_id: "demo-user",
  document_id: demoDocument.id,
  understood_sentence_ids: [],
  bookmarked_sentence_ids: [],
  sentence_notes: {},
  last_studied_at: new Date().toISOString(),
});

const sortFolders = (items: DocumentFolder[]) => [...items].sort((first, second) => {
  const firstOrder = Number.isFinite(first.sort_order) ? Number(first.sort_order) : Number.MAX_SAFE_INTEGER;
  const secondOrder = Number.isFinite(second.sort_order) ? Number(second.sort_order) : Number.MAX_SAFE_INTEGER;
  if (firstOrder !== secondOrder) return firstOrder - secondOrder;
  const createdDifference = first.created_at.localeCompare(second.created_at);
  return createdDifference || first.id.localeCompare(second.id);
});

const isFolderOrderMigrationError = (message: string) =>
  /reorder_document_folders|sort_order|schema cache|PGRST202/i.test(message);

<<<<<<< HEAD
const normalizeDocumentLevel = (document: StudyDocument): StudyDocument => ({
  ...document,
  analysis: { ...document.analysis, level: normalizeCefrLevel(document.analysis.level) },
});

=======
>>>>>>> fe4d3eec85cfa5d310288785ae9ff90b1744039f
export function useStudyWorkspace(configured: boolean) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [documents, setDocuments] = useState<StudyDocument[]>(configured ? [] : [demoDocument]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [current, setCurrent] = useState<StudyDocument | null>(configured ? null : demoDocument);
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [progress, setProgress] = useState<StudyProgress>(createDemoProgress);
  const [view, setView] = useState<View>(configured ? "library" : "study");
  const learning = useLearningAnalytics({ session, current, view });

  useEffect(() => {
    if (!supabase) return;
    clearAuthParamsFromUrl();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) clearAuthParamsFromUrl();
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) clearAuthParamsFromUrl();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void Promise.all([
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
      supabase.from("document_folders").select("*").order("created_at", { ascending: true }),
    ]).then(([documentResult, folderResult]) => {
      if (!documentResult.error) setDocuments((documentResult.data as StudyDocument[]).map(normalizeDocumentLevel));
      // Older deployments may not have the folder migration yet. Keep the rest of the app usable.
      if (!folderResult.error) setFolders(sortFolders(folderResult.data as DocumentFolder[]));
    });
  }, [session]);

  const openDocument = useCallback(async (doc: StudyDocument) => {
    const normalizedDocument = normalizeDocumentLevel(doc);
    setCurrent(normalizedDocument);
    setView("study");
    if (!supabase || !session) return;

    const [wordResult, progressResult] = await Promise.all([
      supabase.from("vocabulary").select("*").eq("document_id", doc.id).order("created_at"),
      supabase.from("study_progress").select("*").eq("document_id", doc.id).maybeSingle(),
    ]);

    setWords((wordResult.data ?? []) as VocabularyItem[]);
    setProgress(
      (progressResult.data as StudyProgress | null) ?? {
        user_id: session.user.id,
        document_id: doc.id,
        understood_sentence_ids: [],
        bookmarked_sentence_ids: [],
        sentence_notes: {},
        last_studied_at: new Date().toISOString(),
      },
    );
  }, [session]);

  const saveWord = async (
    payload: Omit<VocabularyItem, "id" | "user_id" | "created_at" | "updated_at">,
  ) => {
    if (
      words.some(
        (item) => item.sentence_id === payload.sentence_id && item.word.toLowerCase() === payload.word.toLowerCase(),
      )
    ) return;

    if (!supabase || !session) {
      const now = new Date().toISOString();
      const created = { ...payload, id: uid(), user_id: "demo-user", created_at: now, updated_at: now };
      setWords((items) => [...items, created]);
      learning.recordWordSaved(created.id);
      return;
    }

    const result = await supabase
      .from("vocabulary")
      .insert({ ...payload, user_id: session.user.id })
      .select()
      .single();
    if (!result.error) {
      const created = result.data as VocabularyItem;
      setWords((items) => [...items, created]);
      learning.recordWordSaved(created.id);
    }
  };

  const updateWord = async (item: VocabularyItem) => {
    setWords((items) => items.map((value) => (value.id === item.id ? item : value)));
    if (supabase && session) {
      await supabase
        .from("vocabulary")
        .update({
          word: item.word,
          meaning: item.meaning,
          note: item.note,
          status: item.status,
          correct_count: item.correct_count,
          incorrect_count: item.incorrect_count,
          review_count: item.review_count,
        })
        .eq("id", item.id);
    }
  };

  const deleteWord = async (id: string) => {
    setWords((items) => items.filter((item) => item.id !== id));
    if (supabase && session) await supabase.from("vocabulary").delete().eq("id", id);
  };

  const saveProgress = (next: StudyProgress) => {
    const newlyUnderstood = next.understood_sentence_ids.filter((id) => !progress.understood_sentence_ids.includes(id));
    for (const sentenceId of newlyUnderstood) learning.recordSentenceStudied(sentenceId);

    if (current && current.analysis.sentences.length > 0) {
      const wasComplete = progress.understood_sentence_ids.length >= current.analysis.sentences.length;
      const isComplete = next.understood_sentence_ids.length >= current.analysis.sentences.length;
      if (!wasComplete && isComplete) learning.recordDocumentCompleted(current.id);
    }

    setProgress(next);
    if (supabase && session) {
      void supabase
        .from("study_progress")
        .upsert({ ...next, user_id: session.user.id }, { onConflict: "user_id,document_id" });
    }
  };

  const quizResult = (id: string | undefined, correct: boolean) => {
    if (!id) return;
    const item = words.find((word) => word.id === id);
    if (!item) return;

    // Keep cumulative counters for backwards compatibility, while the wordbook
    // reads the rolling last-10 history saved inside the existing study_progress JSON.
    void updateWord({
      ...item,
      review_count: item.review_count + 1,
      correct_count: item.correct_count + (correct ? 1 : 0),
      incorrect_count: item.incorrect_count + (correct ? 0 : 1),
    });
    saveProgress(appendWordQuizResult(progress, id, correct));
  };

  const recordQuizAnswer = (mode: QuizMode, correct: boolean, options?: { wordId?: string; sentenceId?: number }) => {
    learning.recordQuizAnswer(mode, correct, options);
  };

  const recordQuizAttempt = (mode: QuizMode, score: number, questionCount: number) => {
    learning.recordQuizAttempt(mode, score, questionCount, current?.id);
  };

  const addDocumentAndOpen = (doc: StudyDocument) => {
    const normalizedDocument = normalizeDocumentLevel(doc);
    setDocuments((items) => [normalizedDocument, ...items.filter((item) => item.id !== doc.id)]);
    void openDocument(normalizedDocument);
  };

  const applyUpdatedDocument = (doc: StudyDocument) => {
    const normalizedDocument = normalizeDocumentLevel(doc);
    setDocuments((items) => items.map((item) => (item.id === doc.id ? normalizedDocument : item)));
    setCurrent((item) => (item?.id === doc.id ? normalizedDocument : item));
  };

  const renameDocument = async (documentId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("본문 제목을 입력해 주세요.");
    if (trimmed.length > 160) throw new Error("본문 제목은 160자 이하로 입력해 주세요.");

    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new Error("변경할 본문을 찾지 못했습니다.");
    if (document.title === trimmed) return;

    const updatedAt = new Date().toISOString();
    if (supabase && session) {
      const result = await supabase
        .from("documents")
        .update({ title: trimmed, updated_at: updatedAt })
        .eq("id", documentId);
      if (result.error) throw new Error(result.error.message);
    }

    const update = (item: StudyDocument) => item.id === documentId
      ? { ...item, title: trimmed, updated_at: updatedAt }
      : item;
    setDocuments((items) => items.map(update));
    setCurrent((item) => item ? update(item) : item);
  };

  const deleteDocument = async (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new Error("삭제할 본문을 찾지 못했습니다.");

    if (supabase && session) {
      const result = await supabase.from("documents").delete().eq("id", documentId);
      if (result.error) throw new Error(result.error.message);

      // DB의 관련 단어장·진도·퀴즈 행은 외래키 cascade로 함께 정리됩니다.
      // 원본 파일은 DB 밖의 Storage 객체이므로 본문 삭제 성공 후 별도로 정리합니다.
      if (document.source_file_path) {
        const storageResult = await supabase.storage.from("source-files").remove([document.source_file_path]);
        if (storageResult.error) console.warn("Deleted the document but could not remove its source file", storageResult.error);
      }
    }

    setDocuments((items) => items.filter((item) => item.id !== documentId));
    if (current?.id === documentId) {
      setCurrent(null);
      setWords([]);
      setProgress({
        user_id: session?.user.id ?? "demo-user",
        document_id: "",
        understood_sentence_ids: [],
        bookmarked_sentence_ids: [],
        sentence_notes: {},
        last_studied_at: new Date().toISOString(),
      });
      setView("library");
    }
  };

  const renameDocument = async (documentId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("본문 제목을 입력해 주세요.");
    if (trimmed.length > 160) throw new Error("본문 제목은 160자 이하로 입력해 주세요.");

    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new Error("변경할 본문을 찾지 못했습니다.");
    if (document.title === trimmed) return;

    const updatedAt = new Date().toISOString();
    if (supabase && session) {
      const result = await supabase
        .from("documents")
        .update({ title: trimmed, updated_at: updatedAt })
        .eq("id", documentId);
      if (result.error) throw new Error(result.error.message);
    }

    const update = (item: StudyDocument) => item.id === documentId
      ? { ...item, title: trimmed, updated_at: updatedAt }
      : item;
    setDocuments((items) => items.map(update));
    setCurrent((item) => item ? update(item) : item);
  };

  const createFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("폴더 이름을 입력해 주세요.");
    if (folders.some((folder) => folder.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("같은 이름의 폴더가 이미 있습니다.");
    }

    if (!supabase || !session) {
      const now = new Date().toISOString();
      const folder: DocumentFolder = { id: uid(), user_id: "demo-user", name: trimmed, sort_order: folders.length, created_at: now, updated_at: now };
      setFolders((items) => sortFolders([...items, folder]));
      return folder;
    }

    const nextSortOrder = folders.reduce(
      (highest, folder) => Math.max(highest, Number.isFinite(folder.sort_order) ? Number(folder.sort_order) : -1),
      -1,
    ) + 1;
    let result = await supabase
      .from("document_folders")
      .insert({ user_id: session.user.id, name: trimmed, sort_order: nextSortOrder })
      .select()
      .single();
    // Keep folder creation compatible while an older database is waiting for
    // the ordering migration. Reordering itself explains the required setup.
    if (result.error && /sort_order|schema cache/i.test(result.error.message)) {
      result = await supabase
        .from("document_folders")
        .insert({ user_id: session.user.id, name: trimmed })
        .select()
        .single();
    }
    if (result.error) throw new Error(result.error.message.includes("document_folders") ? "폴더 기능 migration을 먼저 적용해 주세요." : result.error.message);
    const folder = { ...(result.data as DocumentFolder), sort_order: (result.data as DocumentFolder).sort_order ?? nextSortOrder };
    setFolders((items) => sortFolders([...items, folder]));
    return folder;
  };

  const renameFolder = async (folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("폴더 이름을 입력해 주세요.");
    setFolders((items) => items.map((folder) => folder.id === folderId ? { ...folder, name: trimmed, updated_at: new Date().toISOString() } : folder));
    if (supabase && session) {
      const result = await supabase.from("document_folders").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", folderId);
      if (result.error) throw new Error(result.error.message);
    }
  };

  const deleteFolder = async (folderId: string) => {
    setFolders((items) => items.filter((folder) => folder.id !== folderId));
    setDocuments((items) => items.map((doc) => doc.folder_id === folderId ? { ...doc, folder_id: null } : doc));
    setCurrent((doc) => doc?.folder_id === folderId ? { ...doc, folder_id: null } : doc);
    if (supabase && session) {
      const result = await supabase.from("document_folders").delete().eq("id", folderId);
      if (result.error) throw new Error(result.error.message);
    }
  };

  const moveDocumentToFolder = async (documentId: string, folderId: string | null) => {
    const update = (doc: StudyDocument) => doc.id === documentId ? { ...doc, folder_id: folderId } : doc;
    setDocuments((items) => items.map(update));
    setCurrent((doc) => doc ? update(doc) : doc);
    if (supabase && session) {
      const result = await supabase.from("documents").update({ folder_id: folderId, updated_at: new Date().toISOString() }).eq("id", documentId);
      if (result.error) throw new Error(result.error.message.includes("folder_id") ? "폴더 기능 migration을 먼저 적용해 주세요." : result.error.message);
    }
  };

  const moveFolder = async (folderId: string, direction: -1 | 1) => {
    const currentIndex = folders.findIndex((folder) => folder.id === folderId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= folders.length) return;

    const previous = folders;
    const reordered = [...folders];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    const updatedAt = new Date().toISOString();
    const normalized = reordered.map((folder, index) => ({ ...folder, sort_order: index, updated_at: updatedAt }));
    setFolders(normalized);

    if (supabase && session) {
      const result = await supabase.rpc("reorder_document_folders", {
        ordered_folder_ids: normalized.map((folder) => folder.id),
      });
      if (result.error) {
        setFolders(previous);
        throw new Error(isFolderOrderMigrationError(result.error.message)
          ? "폴더 순서 migration을 먼저 적용해 주세요."
          : result.error.message);
      }
    }
  };

  return {
    session,
    loading,
    documents,
    folders,
    current,
    words,
    progress,
    view,
    setView,
    openDocument,
    saveWord,
    updateWord,
    deleteWord,
    saveProgress,
    quizResult,
    recordQuizAnswer,
    recordQuizAttempt,
    learningAnalytics: learning.snapshot,
    addDocumentAndOpen,
    applyUpdatedDocument,
    renameDocument,
<<<<<<< HEAD
    deleteDocument,
=======
>>>>>>> fe4d3eec85cfa5d310288785ae9ff90b1744039f
    createFolder,
    renameFolder,
    deleteFolder,
    moveDocumentToFolder,
    moveFolder,
  };
}
