import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { View, QuizMode } from "../app-types";
import type { LearningEvent, LearningEventType, LearningSession, QuizAttempt, StudyDocument } from "../types";
import { uid } from "../lib/app-utils";
import { supabase } from "../lib/supabase";
import { buildLearningAnalytics } from "../features/progress/learning-analytics";

const quizXp = (correct: boolean) => correct ? 10 : 3;
const activeViews: View[] = ["study", "words", "quiz"];

export function useLearningAnalytics({
  session,
  current,
  view,
}: {
  session: Session | null;
  current: StudyDocument | null;
  view: View;
}) {
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [vocabularyCount, setVocabularyCount] = useState(0);
  const [completedDocumentIds, setCompletedDocumentIds] = useState<string[]>([]);

  useEffect(() => {
    if (!supabase || !session) {
      setStorageReady(true);
      return;
    }
    let cancelled = false;
    void Promise.all([
      supabase.from("learning_events").select("*").order("created_at", { ascending: true }),
      supabase.from("learning_sessions").select("*").order("started_at", { ascending: true }),
      supabase.from("quiz_attempts").select("*").order("created_at", { ascending: true }),
      supabase.from("vocabulary").select("id", { count: "exact", head: true }),
      supabase.from("study_progress").select("document_id,understood_sentence_ids"),
      supabase.from("documents").select("id,analysis"),
    ]).then(([eventResult, sessionResult, attemptResult, vocabularyResult, progressResult, documentResult]) => {
      if (cancelled) return;
      const missingTables = Boolean(eventResult.error || sessionResult.error);
      setStorageReady(!missingTables);
      if (!eventResult.error) setEvents((eventResult.data ?? []) as LearningEvent[]);
      if (!sessionResult.error) setSessions((sessionResult.data ?? []) as LearningSession[]);
      if (!attemptResult.error) setQuizAttempts((attemptResult.data ?? []) as QuizAttempt[]);
      if (!vocabularyResult.error) setVocabularyCount(vocabularyResult.count ?? 0);
      if (!progressResult.error && !documentResult.error) {
        const sentenceCountByDocument = new Map<string, number>((documentResult.data ?? []).map((row: { id: string; analysis: { sentences?: unknown[] } }) => [row.id, Array.isArray(row.analysis?.sentences) ? row.analysis.sentences.length : 0]));
        const completed = (progressResult.data ?? []).flatMap((row: { document_id: string; understood_sentence_ids?: number[] }) => {
          const total = sentenceCountByDocument.get(row.document_id) ?? 0;
          return total > 0 && (row.understood_sentence_ids?.length ?? 0) >= total ? [row.document_id] : [];
        });
        setCompletedDocumentIds([...new Set(completed)]);
      }
    });
    return () => { cancelled = true; };
  }, [session]);

  const recordEvent = useCallback((payload: {
    eventType: LearningEventType;
    documentId?: string | null;
    wordId?: string | null;
    sentenceId?: number | null;
    quizMode?: QuizMode | null;
    correct?: boolean | null;
    xp?: number;
    metadata?: Record<string, unknown>;
  }) => {
    const now = new Date().toISOString();
    const event: LearningEvent = {
      id: uid(),
      user_id: session?.user.id ?? "demo-user",
      document_id: payload.documentId ?? current?.id ?? null,
      word_id: payload.wordId ?? null,
      sentence_id: payload.sentenceId ?? null,
      event_type: payload.eventType,
      quiz_mode: payload.quizMode ?? null,
      is_correct: payload.correct ?? null,
      xp: payload.xp ?? 0,
      metadata: payload.metadata ?? {},
      created_at: now,
    };
    setEvents((items) => [...items, event]);
    if (supabase && session) {
      void supabase.from("learning_events").insert(event).then(({ error }) => {
        if (error) setStorageReady(false);
      });
    }
  }, [current?.id, session]);

  const recordQuizAnswer = useCallback((mode: QuizMode, correct: boolean, options?: { wordId?: string; sentenceId?: number }) => {
    recordEvent({
      eventType: "quiz_answer",
      quizMode: mode,
      correct,
      wordId: options?.wordId,
      sentenceId: options?.sentenceId,
      xp: quizXp(correct),
    });
  }, [recordEvent]);

  const recordSentenceStudied = useCallback((sentenceId: number) => {
    recordEvent({ eventType: "sentence_studied", sentenceId, xp: 5 });
  }, [recordEvent]);

  const recordWordSaved = useCallback((wordId: string) => {
    setVocabularyCount((value) => value + 1);
    recordEvent({ eventType: "word_saved", wordId, xp: 4 });
  }, [recordEvent]);

  const recordDocumentCompleted = useCallback((documentId: string) => {
    if (completedDocumentIds.includes(documentId) || events.some((event) => event.event_type === "document_completed" && event.document_id === documentId)) return;
    setCompletedDocumentIds((items) => [...items, documentId]);
    recordEvent({ eventType: "document_completed", documentId, xp: 50 });
  }, [completedDocumentIds, events, recordEvent]);

  const recordQuizAttempt = useCallback((mode: QuizMode, score: number, questionCount: number, documentId?: string) => {
    const attempt: QuizAttempt = {
      id: uid(),
      user_id: session?.user.id ?? "demo-user",
      document_id: documentId ?? current?.id ?? "",
      mode,
      score,
      question_count: questionCount,
      created_at: new Date().toISOString(),
    };
    setQuizAttempts((items) => [...items, attempt]);
    if (supabase && session && attempt.document_id) void supabase.from("quiz_attempts").insert(attempt);
  }, [current?.id, session]);

  useEffect(() => {
    if (!current || !activeViews.includes(view)) return;
    const localId = uid();
    const startedAt = new Date().toISOString();
    let activeSeconds = 0;
    let cancelled = false;
    const learningSession: LearningSession = {
      id: localId,
      user_id: session?.user.id ?? "demo-user",
      document_id: current.id,
      view: view as LearningSession["view"],
      started_at: startedAt,
      last_active_at: startedAt,
      ended_at: null,
      active_seconds: 0,
    };
    setSessions((items) => [...items, learningSession]);
    if (supabase && session) {
      void supabase.from("learning_sessions").insert(learningSession).then(({ error }) => {
        if (error && !cancelled) setStorageReady(false);
      });
    }

    const sync = (final = false) => {
      const now = new Date().toISOString();
      const patch = {
        active_seconds: activeSeconds,
        last_active_at: now,
        ended_at: final ? now : null,
      };
      setSessions((items) => items.map((item) => item.id === localId ? { ...item, ...patch } : item));
      if (supabase && session) void supabase.from("learning_sessions").update(patch).eq("id", localId);
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      activeSeconds += 30;
      sync(false);
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (document.visibilityState === "visible") activeSeconds += 5;
      sync(true);
    };
  }, [current?.id, view, session]);

  const snapshot = useMemo(
    () => buildLearningAnalytics({ events, sessions, quizAttempts, storageReady, vocabularyCount, completedDocumentCount: completedDocumentIds.length }),
    [events, sessions, quizAttempts, storageReady, vocabularyCount, completedDocumentIds],
  );

  return {
    events,
    sessions,
    quizAttempts,
    snapshot,
    recordQuizAnswer,
    recordQuizAttempt,
    recordSentenceStudied,
    recordWordSaved,
    recordDocumentCompleted,
  };
}
