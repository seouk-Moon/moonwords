import { useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getFunctionErrorMessage } from "../lib/function-error";
import type { QuizGenerationJob, QuizGenerationType, View } from "../app-types";
import type { ReadingQuestion, StudyDocument, VocabularyItem } from "../types";
import {
  createAdditionalClozeQuestions,
  createLocalComprehensionQuestions,
  mergeUniqueQuestions,
} from "../features/quiz/quiz-utils";

type Params = {
  current: StudyDocument | null;
  documents: StudyDocument[];
  words: VocabularyItem[];
  session: Session | null;
  openDocument: (doc: StudyDocument) => Promise<void>;
  applyUpdatedDocument: (doc: StudyDocument) => void;
  setView: (view: View) => void;
};

export function useQuizGeneration({
  current,
  documents,
  words,
  session,
  openDocument,
  applyUpdatedDocument,
  setView,
}: Params) {
  const [generationJob, setGenerationJob] = useState<QuizGenerationJob | null>(null);
  const generationRun = useRef(0);

  const startQuizGeneration = async (type: QuizGenerationType, requestedCount: number) => {
    if (!current || generationJob?.status === "running") return;
    const target = current;
    const count = Math.max(1, Math.min(type === "comprehension" ? 5 : 20, requestedCount));
    const runId = generationRun.current + 1;
    generationRun.current = runId;
    setGenerationJob({
      id: runId,
      type,
      documentId: target.id,
      status: "running",
      message: type === "comprehension"
        ? `AI가 본문 이해 문제 ${count}개를 만드는 중…`
        : `빈칸 문제 ${count}개를 만드는 중…`,
    });

    try {
      let nextAnalysis = target.analysis;
      let addedCount = 0;

      if (type === "comprehension") {
        let generated: ReadingQuestion[] = [];
        if (supabase && session) {
          let lastError = "AI 문제 생성에 실패했습니다.";
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (generationRun.current !== runId) return;
            const response = await supabase.functions.invoke("process-document", {
              body: { action: "analyze", title: `${target.title} 추가 문제`, text: target.original_text },
            });
            if (!response.error) {
              generated = (response.data?.analysis?.questions ?? []).slice(0, count) as ReadingQuestion[];
              break;
            }
            lastError = await getFunctionErrorMessage(response.error);
            if (
              !/429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(lastError) ||
              attempt === 2
            ) throw new Error(lastError);
            setGenerationJob({
              id: runId,
              type,
              documentId: target.id,
              status: "running",
              message: `AI 서버 재시도 중 (${attempt + 2}/3)… 다른 화면을 이용해도 됩니다.`,
            });
            await new Promise((resolve) => window.setTimeout(resolve, (2 ** attempt) * 1_500));
          }
        } else {
          generated = createLocalComprehensionQuestions(target, count);
        }
        const merged = mergeUniqueQuestions(target.analysis.questions, generated);
        addedCount = merged.length - target.analysis.questions.length;
        nextAnalysis = { ...target.analysis, questions: merged };
      } else {
        const generated = createAdditionalClozeQuestions(target, words, count);
        const merged = mergeUniqueQuestions(target.analysis.cloze_questions ?? [], generated);
        addedCount = merged.length - (target.analysis.cloze_questions?.length ?? 0);
        nextAnalysis = { ...target.analysis, cloze_questions: merged };
      }

      if (generationRun.current !== runId) return;
      if (!addedCount) {
        throw new Error("새롭게 추가할 수 있는 문제가 없어요. 다른 개수로 다시 시도해 주세요.");
      }

      const updatedDocument: StudyDocument = {
        ...target,
        analysis: nextAnalysis,
        updated_at: new Date().toISOString(),
      };

      if (supabase && session) {
        const result = await supabase
          .from("documents")
          .update({ analysis: nextAnalysis, updated_at: updatedDocument.updated_at })
          .eq("id", target.id);
        if (result.error) throw result.error;
      }

      if (generationRun.current !== runId) return;
      applyUpdatedDocument(updatedDocument);
      setGenerationJob({
        id: runId,
        type,
        documentId: target.id,
        status: "success",
        message: `${type === "comprehension" ? "본문 이해" : "빈칸"} 문제 ${addedCount}개가 추가되었습니다.`,
      });
    } catch (caught) {
      if (generationRun.current !== runId) return;
      setGenerationJob({
        id: runId,
        type,
        documentId: target.id,
        status: "error",
        message: caught instanceof Error ? caught.message : "문제 생성에 실패했습니다.",
      });
    }
  };

  const stopQuizGeneration = () => {
    generationRun.current += 1;
    setGenerationJob((job) =>
      job?.status === "running"
        ? { ...job, status: "cancelled", message: "문제 생성을 중단했습니다." }
        : job,
    );
  };

  const openGeneratedQuiz = () => {
    const target = documents.find((document) => document.id === generationJob?.documentId);
    if (!target) return;
    void openDocument(target).then(() => setView("quiz"));
  };

  return {
    generationJob,
    setGenerationJob,
    startQuizGeneration,
    stopQuizGeneration,
    openGeneratedQuiz,
  };
}
