import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoDocument } from "../demo";
import { supabase } from "../lib/supabase";
import { uid } from "../lib/app-utils";
import type { View } from "../app-types";
import type { DocumentFolder, StudyDocument, StudyProgress, VocabularyItem } from "../types";

const createDemoProgress = (): StudyProgress => ({
  user_id: "demo-user",
  document_id: demoDocument.id,
  understood_sentence_ids: [],
  bookmarked_sentence_ids: [],
  sentence_notes: {},
  last_studied_at: new Date().toISOString(),
});

export function useStudyWorkspace(configured: boolean) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [documents, setDocuments] = useState<StudyDocument[]>(configured ? [] : [demoDocument]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [current, setCurrent] = useState<StudyDocument | null>(configured ? null : demoDocument);
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [progress, setProgress] = useState<StudyProgress>(createDemoProgress);
  const [view, setView] = useState<View>(configured ? "library" : "study");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void Promise.all([
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
      supabase.from("document_folders").select("*").order("created_at", { ascending: true }),
    ]).then(([documentResult, folderResult]) => {
      if (!documentResult.error) setDocuments(documentResult.data as StudyDocument[]);
      // Older deployments may not have the folder migration yet. Keep the rest of the app usable.
      if (!folderResult.error) setFolders(folderResult.data as DocumentFolder[]);
    });
  }, [session]);

  const openDocument = useCallback(async (doc: StudyDocument) => {
    setCurrent(doc);
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
      setWords((items) => [
        ...items,
        { ...payload, id: uid(), user_id: "demo-user", created_at: now, updated_at: now },
      ]);
      return;
    }

    const result = await supabase
      .from("vocabulary")
      .insert({ ...payload, user_id: session.user.id })
      .select()
      .single();
    if (!result.error) setWords((items) => [...items, result.data as VocabularyItem]);
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
    void updateWord({
      ...item,
      review_count: item.review_count + 1,
      correct_count: item.correct_count + (correct ? 1 : 0),
      incorrect_count: item.incorrect_count + (correct ? 0 : 1),
    });
  };

  const addDocumentAndOpen = (doc: StudyDocument) => {
    setDocuments((items) => [doc, ...items.filter((item) => item.id !== doc.id)]);
    void openDocument(doc);
  };

  const applyUpdatedDocument = (doc: StudyDocument) => {
    setDocuments((items) => items.map((item) => (item.id === doc.id ? doc : item)));
    setCurrent((item) => (item?.id === doc.id ? doc : item));
  };

  const createFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("폴더 이름을 입력해 주세요.");
    if (folders.some((folder) => folder.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("같은 이름의 폴더가 이미 있습니다.");
    }

    if (!supabase || !session) {
      const now = new Date().toISOString();
      const folder: DocumentFolder = { id: uid(), user_id: "demo-user", name: trimmed, created_at: now, updated_at: now };
      setFolders((items) => [...items, folder]);
      return folder;
    }

    const result = await supabase
      .from("document_folders")
      .insert({ user_id: session.user.id, name: trimmed })
      .select()
      .single();
    if (result.error) throw new Error(result.error.message.includes("document_folders") ? "폴더 기능 migration을 먼저 적용해 주세요." : result.error.message);
    const folder = result.data as DocumentFolder;
    setFolders((items) => [...items, folder]);
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
    addDocumentAndOpen,
    applyUpdatedDocument,
    createFolder,
    renameFolder,
    deleteFolder,
    moveDocumentToFolder,
  };
}
