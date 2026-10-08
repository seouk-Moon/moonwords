import { useEffect, useMemo, useRef, useState } from "react";
import { buildOrderingExercise } from "../../lib/ordering-quiz";
import { shuffle } from "../../lib/app-utils";
import type { StudyDocument, StudyProgress, VocabularyItem, ReadingQuestion } from "../../types";
import type { ChoiceQuizQuestion, ComprehensionScope, FlashcardQuestion, OrderingQuizQuestion, OrderingScope, QuizGenerationJob, QuizGenerationType, QuizMistakeReviewItem, QuizMode, QuizQuestion, VocabDirection, VocabFormat, WrittenQuizQuestion } from "../../app-types";
import {
  MAX_CLOZE_GENERATION_COUNT,
  MAX_COMPREHENSION_GENERATION_COUNT,
  readMissedComprehensionIds,
  normalizeQuestionText,
  uniqueQuizQuestions,
  distinctAlternatives,
} from "./quiz-utils";
import { buildVocabularySets, quizStudyKey, readStudySettings, toggleStudyMark, wordStudyKey } from "../vocabulary/study-sets";
import { readWordQuizRecentResults } from "../vocabulary/recent-results";
import { WordPronunciationButton } from "./WordPronunciationButton";
import { QuizResult } from "./QuizResult";
import { OrderingContextExcerpt } from "./OrderingContextExcerpt";

export function Quiz({ doc, words, progress, generationJob, onClose, onGenerate, onProgress, onResult, onQuestionAnswered, onQuizComplete }: { doc: StudyDocument; words: VocabularyItem[]; progress: StudyProgress; generationJob: QuizGenerationJob | null; onClose: () => void; onGenerate: (type: QuizGenerationType, count: number) => void; onProgress: (next: StudyProgress) => void; onResult: (id: string | undefined, correct: boolean, options?: { quizKey?: string; sourceQuestionId?: number }) => void; onQuestionAnswered: (mode: QuizMode, correct: boolean, options?: { wordId?: string; sentenceId?: number }) => void; onQuizComplete: (mode: QuizMode, score: number, questionCount: number) => void }) {
  const [mode, setMode] = useState<QuizMode>(doc.analysis.collection ? "meaning" : "comprehension");
  const writtenInput = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const [quizRun, setQuizRun] = useState(0);
  const [runMistakes, setRunMistakes] = useState<QuizMistakeReviewItem[]>([]);
  const completedRunRef = useRef<number | null>(null);

  const [comprehensionScope, setComprehensionScope] = useState<ComprehensionScope>("all");
  const [missedComprehensionIds, setMissedComprehensionIds] = useState<number[]>(() => readMissedComprehensionIds(progress, doc.analysis.questions.length));
  const [comprehensionUseAll, setComprehensionUseAll] = useState(true);
  const [comprehensionCount, setComprehensionCount] = useState(Math.max(1, Math.min(10, doc.analysis.questions.length)));
  const [activeComprehensionIds, setActiveComprehensionIds] = useState<number[]>(() => shuffle(doc.analysis.questions.map((_, questionIndex) => questionIndex)));

  const [vocabDirection, setVocabDirection] = useState<VocabDirection>("english-korean");
  const [vocabFormat, setVocabFormat] = useState<VocabFormat>("choice");
  const [selectedSet, setSelectedSet] = useState("all");
  const [pendingSetStart, setPendingSetStart] = useState(false);
  const [reviewScope, setReviewScope] = useState<"all" | "incorrect" | "starred" | "new">("all");
  const studySettings = readStudySettings(progress);
  const vocabularySets = buildVocabularySets(words, studySettings.setSize);
  const selectedWordIds = selectedSet === "all" ? words.map((word) => word.id) : vocabularySets[Number(selectedSet)]?.map((word) => word.id) ?? [];
  const selectedWordSignature = JSON.stringify(selectedWordIds);
  const selectedWordSnapshot = useMemo(() => JSON.parse(selectedWordSignature) as string[], [selectedWordSignature]);
  const sessionQuestions = useRef<{ run: number; questions: QuizQuestion[] } | null>(null);
  const [generationCount, setGenerationCount] = useState(5);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [writtenRevealed, setWrittenRevealed] = useState(false);
  const [writtenGraded, setWrittenGraded] = useState<boolean | null>(null);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [flashcardDragX, setFlashcardDragX] = useState(0);
  const [flashcardQueue, setFlashcardQueue] = useState<FlashcardQuestion[]>([]);
  const [flashcardRetryByWord, setFlashcardRetryByWord] = useState<Record<string, number>>({});
  const [flashcardTurn, setFlashcardTurn] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const flashcardPointerStart = useRef<number | null>(null);
  const flashcardDragCurrent = useRef(0);
  const suppressFlashcardClick = useRef(false);

  const [orderingScope, setOrderingScope] = useState<OrderingScope>("all");
  const [selectedSentenceIds, setSelectedSentenceIds] = useState<number[]>([]);
  const [shortenLongSentence, setShortenLongSentence] = useState(true);
  const [orderedTokenIds, setOrderedTokenIds] = useState<string[]>([]);
  const [orderingSubmitted, setOrderingSubmitted] = useState(false);
  const [orderingCorrect, setOrderingCorrect] = useState(false);

  // Keep an active quiz set stable when only review/correct/incorrect counters change.
  // Those counters are updated after answering and must not reshuffle the current question.
  const quizWordsSignature = JSON.stringify(words.map((word) => ({
    id: word.id,
    sentence_id: word.sentence_id,
    word: word.word,
    meaning: word.meaning,
    source_sentence: word.source_sentence,
    translation: word.translation,
  })));
  const quizWordsSnapshot = useMemo(
    () => JSON.parse(quizWordsSignature) as Array<Pick<VocabularyItem, "id" | "sentence_id" | "word" | "meaning" | "source_sentence" | "translation">>,
    [quizWordsSignature],
  );
  // Saving an answer updates doc.last_studied_at, not the quiz content.
  // Depending on the whole document would reshuffle questions and options
  // while picked still refers to the question that was just answered.
  const analysis = doc.analysis;

  const preparedQuestions = useMemo<QuizQuestion[]>(() => {
    void quizRun;
    if (mode === "comprehension") return activeComprehensionIds.flatMap((questionId): ChoiceQuizQuestion[] => {
      const question = analysis.questions[questionId] as ReadingQuestion | undefined;
      return question ? [{ kind: "choice", prompt: question.question, options: question.options, answer: question.answer, explanation: question.explanation, sourceQuestionId: questionId }] : [];
    });
    if (mode === "ordering") {
      const targetSentences = orderingScope === "all"
        ? analysis.sentences
        : orderingScope === "difficult"
          ? analysis.sentences.filter((sentence) => progress.bookmarked_sentence_ids.includes(sentence.id))
          : analysis.sentences.filter((sentence) => selectedSentenceIds.includes(sentence.id));

      return shuffle(targetSentences).flatMap((sentence): OrderingQuizQuestion[] => {
        const protectedPhrases = [
          ...sentence.keywords.map((keyword) => keyword.word),
          ...quizWordsSnapshot.filter((word) => word.sentence_id === sentence.id).map((word) => word.word),
        ];
        const exercise = buildOrderingExercise(sentence.english, protectedPhrases, shortenLongSentence);
        if (exercise.answerTokens.length < 2) return [];
        const sentenceIndex = analysis.sentences.findIndex((item) => item.id === sentence.id);
        const contextBefore = sentenceIndex > 0 ? analysis.sentences[sentenceIndex - 1]?.english : undefined;
        const contextAfter = sentenceIndex >= 0 && sentenceIndex + 1 < analysis.sentences.length
          ? analysis.sentences[sentenceIndex + 1]?.english
          : undefined;
        return [{
          kind: "ordering",
          prompt: exercise.shortened ? "앞뒤 문맥을 참고해 현재 문장의 일부를 배열하세요." : "앞뒤 문맥을 참고해 현재 문장을 배열하세요.",
          explanation: exercise.excerpt,
          contextBefore,
          contextAfter,
          sameSentenceBefore: exercise.sameSentenceBefore,
          sameSentenceAfter: exercise.sameSentenceAfter,
          sentenceId: sentence.id,
          answerTokens: exercise.answerTokens,
          shuffledTokens: exercise.shuffledTokens,
          shortened: exercise.shortened,
          sourceSentence: sentence.english,
          testedPart: exercise.excerpt,
        }];
      });
    }
    if (mode === "cloze") {
      const savedWordQuestions = quizWordsSnapshot.filter((word) => selectedWordSnapshot.includes(word.id)).map((word): ChoiceQuizQuestion => {
        const blank = word.source_sentence.replace(new RegExp(`\\b${word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "______");
        const alternatives = shuffle(distinctAlternatives(quizWordsSnapshot.filter((item) => item.id !== word.id).map((item) => item.word), word.word)).slice(0, 3);
        const options = shuffle([word.word, ...alternatives]);
        return { kind: "choice", prompt: blank, options, answer: options.indexOf(word.word), explanation: `${word.word} — ${word.meaning}`, wordId: word.id, sourceSentence: word.source_sentence, testedPart: word.word };
      });
      const generatedQuestions = (analysis.cloze_questions ?? []).map((question): ChoiceQuizQuestion => {
        const answerText = question.options[question.answer] ?? "";
        const sourceSentence = answerText && /_{3,}/.test(question.question)
          ? question.question.replace(/_{3,}/, answerText)
          : undefined;
        return { kind: "choice", prompt: question.question, options: question.options, answer: question.answer, explanation: question.explanation, sourceSentence, testedPart: answerText || undefined };
      });
      return shuffle([...savedWordQuestions, ...(selectedSet === "all" || selectedSet === "generated" ? generatedQuestions : [])]);
    }
    if (!quizWordsSnapshot.length) return [];
    const targetWords = shuffle(quizWordsSnapshot.filter((word) => selectedWordSnapshot.includes(word.id)));
    if (mode === "flashcard") return targetWords.map((word): FlashcardQuestion => ({
      kind: "flashcard",
      front: vocabDirection === "english-korean" ? word.word : word.meaning,
      back: vocabDirection === "english-korean" ? word.meaning : word.word,
      example: word.source_sentence,
      translation: word.translation,
      wordId: word.id,
      sourceSentence: word.source_sentence,
      testedPart: word.word,
    }));
    if (mode === "meaning") return targetWords.map((word): ChoiceQuizQuestion | WrittenQuizQuestion => {
      const prompt = vocabDirection === "english-korean" ? `“${word.word}”의 뜻은?` : `“${word.meaning}”에 해당하는 영어 단어는?`;
      const answerText = vocabDirection === "english-korean" ? word.meaning : word.word;
      if (vocabFormat === "written") return { kind: "written", prompt, answerText, explanation: `${word.source_sentence}\n${word.translation}`, wordId: word.id, sourceSentence: word.source_sentence, testedPart: word.word };
      const candidates = quizWordsSnapshot.filter((item) => item.id !== word.id).map((item) => vocabDirection === "english-korean" ? item.meaning : item.word);
      const alternatives = shuffle(distinctAlternatives(candidates, answerText)).slice(0, 3);
      const options = shuffle([answerText, ...alternatives]);
      return { kind: "choice", prompt, options, answer: options.indexOf(answerText), explanation: word.source_sentence, wordId: word.id, sourceSentence: word.source_sentence, testedPart: word.word };
    });
    return [];
  }, [mode, quizWordsSnapshot, analysis, orderingScope, selectedSentenceIds, shortenLongSentence, progress.bookmarked_sentence_ids, activeComprehensionIds, vocabDirection, vocabFormat, selectedSet, selectedWordSnapshot, quizRun]);

  const recentWordResults = readWordQuizRecentResults(progress);
  const isIncorrect = (item: QuizQuestion) => {
    const key = quizStudyKey(mode, item);
    if (studySettings.incorrect.includes(key)) return true;
    if (mode === "comprehension" && item.kind === "choice" && item.sourceQuestionId !== undefined) return missedComprehensionIds.includes(item.sourceQuestionId);
    if ("wordId" in item && item.wordId) return recentWordResults[item.wordId]?.at(-1) === false;
    return false;
  };
  const latestBatchKeys = mode === "comprehension" || mode === "cloze" ? analysis.latest_generated_questions?.[mode] ?? [] : [];
  const availableQuestions = uniqueQuizQuestions(preparedQuestions, { preserveWordEntries: mode === "meaning" || mode === "flashcard" }).filter((item) => reviewScope === "all" || (reviewScope === "new" ? "prompt" in item && latestBatchKeys.includes(normalizeQuestionText(item.prompt)) : reviewScope === "incorrect" ? isIncorrect(item) : studySettings.starred.includes(quizStudyKey(mode, item))));
  // Marking a question or saving a result must never change a running set.
  if (!started || sessionQuestions.current?.run !== quizRun) sessionQuestions.current = { run: quizRun, questions: availableQuestions };
  const questions = started ? sessionQuestions.current.questions : availableQuestions;

  useEffect(() => {
    if (started || generationJob?.status !== "success" || generationJob.documentId !== doc.id) return;
    const type = generationJob.type;
    setMode(type === "comprehension" ? "comprehension" : "cloze");
    setReviewScope("new");
    setStarted(false);
    if (type === "cloze") setSelectedSet("generated");
    else {
      setComprehensionScope("all");
      setComprehensionUseAll(true);
      setActiveComprehensionIds(shuffle(doc.analysis.questions.map((_, questionId) => questionId)));
    }
    setQuizRun((value) => value + 1);
    clearRun();
  }, [generationJob?.id, generationJob?.status, generationJob?.documentId, doc.id]);

  const nextSetIndex = reviewScope !== "new" && (mode === "meaning" || mode === "cloze" || mode === "flashcard") && /^\d+$/.test(selectedSet)
    ? vocabularySets.findIndex((set, setIndex) => setIndex > Number(selectedSet) && set.some((word) => {
      const key = wordStudyKey(word.id);
      return reviewScope === "all" || (reviewScope === "starred" ? studySettings.starred.includes(key) : studySettings.incorrect.includes(key) || recentWordResults[word.id]?.at(-1) === false);
    }))
    : -1;
  const startNextSet = () => {
    if (nextSetIndex < 0) return;
    setSelectedSet(String(nextSetIndex));
    clearRun();
    setQuizRun((value) => value + 1);
    setStarted(false);
    setPendingSetStart(true);
  };
  useEffect(() => {
    if (!pendingSetStart || started) return;
    setPendingSetStart(false);
    if (!questions.length) return;
    if (mode === "flashcard") setFlashcardQueue(questions.filter((item): item is FlashcardQuestion => item.kind === "flashcard"));
    setStarted(true);
  }, [pendingSetStart, started, mode, questions]);

  useEffect(() => {
    if (!done || !started || answeredCount <= 0 || completedRunRef.current === quizRun) return;
    completedRunRef.current = quizRun;
    onQuizComplete(mode, score, answeredCount);
  }, [done, started, answeredCount, quizRun, mode, score, onQuizComplete]);

  const clearAnswer = () => {
    setPicked(null); setOrderedTokenIds([]); setOrderingSubmitted(false); setOrderingCorrect(false);
    flashcardDragCurrent.current = 0;
    setWrittenAnswer(""); setWrittenRevealed(false); setWrittenGraded(null); setFlashcardFlipped(false); setFlashcardDragX(0);
  };
  const clearRun = () => { setIndex(0); setScore(0); setAnsweredCount(0); setDone(false); setRunMistakes([]); setFlashcardQueue([]); setFlashcardRetryByWord({}); setFlashcardTurn(0); suppressFlashcardClick.current = false; clearAnswer(); };
  const prepareComprehension = (scope = comprehensionScope, useAll = comprehensionUseAll, count = comprehensionCount, review = reviewScope) => {
    const allIds = doc.analysis.questions.map((_, questionIndex) => questionIndex);
    const scopedIds = review === "new" ? allIds : scope === "incorrect" ? missedComprehensionIds.filter((id) => allIds.includes(id)) : allIds;
    const pool = scopedIds.filter((id) => {
      const key = `comprehension:${doc.analysis.questions[id].question}`;
      return review === "all" || (review === "new" ? (doc.analysis.latest_generated_questions?.comprehension ?? []).includes(normalizeQuestionText(doc.analysis.questions[id].question)) : review === "starred" ? studySettings.starred.includes(key) : studySettings.incorrect.includes(key) || missedComprehensionIds.includes(id));
    });
    const limit = useAll ? pool.length : Math.min(Math.max(count, 1), pool.length);
    setMode("comprehension"); setActiveComprehensionIds(shuffle(pool).slice(0, limit)); setQuizRun((value) => value + 1); clearRun();
  };
  const reset = (nextMode = mode) => {
    setStarted(false);
    setReviewScope("all");
    if (nextMode === "comprehension") { prepareComprehension(); return; }
    setMode(nextMode); setQuizRun((value) => value + 1); clearRun();
  };
  const startQuiz = () => {
    if (mode === "comprehension") prepareComprehension(comprehensionScope, comprehensionUseAll, comprehensionCount);
    else if (mode === "flashcard") {
      const queue = questions.filter((item): item is FlashcardQuestion => item.kind === "flashcard");
      setQuizRun((value) => value + 1);
      clearRun();
      setFlashcardQueue(queue);
    } else { setQuizRun((value) => value + 1); clearRun(); }
    setStarted(true);
  };
  const saveMissedComprehensionIds = (questionId: number, correct: boolean) => {
    const next = correct
      ? missedComprehensionIds.filter((id) => id !== questionId)
      : [...new Set([...missedComprehensionIds, questionId])];
    if (next.length === missedComprehensionIds.length && next.every((id, itemIndex) => id === missedComprehensionIds[itemIndex])) return;
    setMissedComprehensionIds(next);
  };
  const updateOrderingScope = (scope: OrderingScope) => { setStarted(false); setOrderingScope(scope); setQuizRun((value) => value + 1); clearRun(); };
  const updateSentenceSelection = (sentenceId: number) => {
    setStarted(false);
    setSelectedSentenceIds((current) => current.includes(sentenceId) ? current.filter((id) => id !== sentenceId) : [...current, sentenceId]);
    setQuizRun((value) => value + 1); clearRun();
  };
  const rememberMistake = (mistake: QuizMistakeReviewItem) => {
    setRunMistakes((items) => items.some((item) => item.id === mistake.id) ? items : [...items, mistake]);
  };
  const answer = (choice: number) => {
    const question = questions[index];
    if (picked !== null || question?.kind !== "choice") return;
    setPicked(choice);
    setAnsweredCount((value) => value + 1);
    const correct = choice === question.answer;
    if (correct) setScore((value) => value + 1);
    else rememberMistake({
      id: `choice:${quizRun}:${index}:${question.wordId ?? question.sourceQuestionId ?? question.prompt}`,
      studyKey: quizStudyKey(mode, question),
      prompt: question.prompt,
      selected: question.options[choice] ?? "",
      answer: question.options[question.answer] ?? "",
      explanation: question.explanation,
      sourceSentence: question.sourceSentence,
      testedPart: question.testedPart,
    });
    if (question.sourceQuestionId !== undefined) saveMissedComprehensionIds(question.sourceQuestionId, correct);
    onResult(question.wordId, correct, { quizKey: quizStudyKey(mode, question), sourceQuestionId: question.sourceQuestionId });
    onQuestionAnswered(mode, correct, { wordId: question.wordId });
  };
  const gradeWritten = (correct: boolean) => {
    const question = questions[index];
    if (question?.kind !== "written" || writtenGraded !== null) return;
    setWrittenGraded(correct);
    setAnsweredCount((value) => value + 1);
    if (correct) setScore((value) => value + 1);
    else rememberMistake({
      id: `written:${quizRun}:${index}:${question.wordId}`,
      studyKey: quizStudyKey(mode, question),
      prompt: question.prompt,
      selected: writtenAnswer,
      answer: question.answerText,
      explanation: question.explanation,
      sourceSentence: question.sourceSentence,
      testedPart: question.testedPart,
    });
    onResult(question.wordId, correct, { quizKey: quizStudyKey(mode, question) });
    onQuestionAnswered(mode, correct, { wordId: question.wordId });
  };
  const gradeFlashcard = (correct: boolean) => {
    const question = flashcardQueue[0];
    if (!question || !flashcardFlipped) return;
    onResult(question.wordId, correct, { quizKey: quizStudyKey(mode, question) });
    onQuestionAnswered(mode, correct, { wordId: question.wordId });
    setAnsweredCount((value) => value + 1);
    // Always start the next/retried card from the front face.
    // Incrementing the turn also remounts the card so a trailing click after a swipe
    // cannot leave the next card showing the previous card's back face.
    setFlashcardFlipped(false);
    setFlashcardTurn((value) => value + 1);
    flashcardPointerStart.current = null;
    flashcardDragCurrent.current = 0;
    setFlashcardDragX(0);

    if (correct) {
      setScore((value) => value + 1);
      if (flashcardQueue.length <= 1) {
        setFlashcardQueue([]);
        setDone(true);
      } else {
        setFlashcardQueue((items) => items.slice(1));
      }
      setIndex(0);
      clearAnswer();
      return;
    }

    const reviewMeaning = words.find((word) => word.id === question.wordId)?.meaning ?? question.back;
    rememberMistake({
      id: `flashcard:${quizRun}:${question.wordId}`,
      studyKey: quizStudyKey(mode, question),
      prompt: question.front,
      answer: reviewMeaning,
      sourceSentence: question.sourceSentence,
      testedPart: question.testedPart,
    });
    setFlashcardRetryByWord((items) => ({ ...items, [question.wordId]: (items[question.wordId] ?? 0) + 1 }));
    setFlashcardQueue((items) => items.length > 1 ? [...items.slice(1), items[0]] : items);
    setIndex(0);
    clearAnswer();
  };
  useEffect(() => {
    if (!started || done || mode !== "flashcard" || !flashcardQueue.length) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"))) return;
      if (event.repeat) {
        if (["Enter", " ", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && !flashcardFlipped) {
        if (target instanceof HTMLElement && target.closest("button, a, [role='tab']")) return;
        event.preventDefault();
        setFlashcardFlipped(true);
      } else if (flashcardFlipped && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        gradeFlashcard(event.key === "ArrowRight");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [started, done, mode, flashcardFlipped, flashcardQueue, gradeFlashcard]);

  const submitOrdering = () => {
    const question = questions[index];
    if (question?.kind !== "ordering" || orderingSubmitted || orderedTokenIds.length !== question.answerTokens.length) return;
    const answerTokens = orderedTokenIds.map((id) => question.shuffledTokens.find((token) => token.id === id)?.text ?? "");
    const correct = answerTokens.every((token, tokenIndex) => token === question.answerTokens[tokenIndex]);
    setOrderingCorrect(correct); setOrderingSubmitted(true);
    setAnsweredCount((value) => value + 1);
    onResult(undefined, correct, { quizKey: quizStudyKey(mode, question) });
    onQuestionAnswered(mode, correct, { sentenceId: question.sentenceId });
    if (correct) setScore((value) => value + 1);
    else rememberMistake({
      id: `ordering:${quizRun}:${index}:${question.sentenceId}`,
      studyKey: quizStudyKey(mode, question),
      prompt: "영어 어순 배열",
      selected: answerTokens.join(" "),
      answer: question.answerTokens.join(" "),
      explanation: question.explanation,
      sourceSentence: question.sourceSentence,
      testedPart: question.testedPart,
    });
  };
  const next = () => {
    if (index + 1 >= questions.length) setDone(true);
    else { setIndex((value) => value + 1); clearAnswer(); }
  };
  useEffect(() => {
    if (started && !done && mode === "meaning" && vocabFormat === "written") writtenInput.current?.focus();
  }, [started, done, index, quizRun, mode, vocabFormat]);

  useEffect(() => {
    if (!started || done || mode !== "meaning" || vocabFormat !== "written" || !writtenRevealed || writtenGraded !== null) return;
    const handleWrittenGrade = (event: KeyboardEvent) => {
      if ((event.key !== "ArrowLeft" && event.key !== "ArrowRight") || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("textarea, select, input:not(:disabled), [contenteditable='true'], [role='textbox']")) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) gradeWritten(event.key === "ArrowRight");
    };
    window.addEventListener("keydown", handleWrittenGrade, true);
    return () => window.removeEventListener("keydown", handleWrittenGrade, true);
  }, [started, done, mode, vocabFormat, writtenRevealed, writtenGraded, gradeWritten]);

  useEffect(() => {
    if (!started || done || mode === "flashcard") return;
    const ready = picked !== null || writtenGraded !== null || orderingSubmitted;
    const handleEnter = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (event.repeat) { event.preventDefault(); return; }
      if (!ready || target instanceof HTMLElement && target.closest("textarea, select, input:not(:disabled), [contenteditable='true'], [role='textbox']")) return;
      event.preventDefault(); event.stopPropagation(); next();
    };
    window.addEventListener("keydown", handleEnter, true);
    return () => window.removeEventListener("keydown", handleEnter, true);
  }, [started, done, mode, picked, writtenGraded, orderingSubmitted, index, questions.length]);

  const beginFlashcardSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!flashcardFlipped) return;
    flashcardPointerStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveFlashcardSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (flashcardPointerStart.current === null || !flashcardFlipped) return;
    const nextDrag = Math.max(-180, Math.min(180, event.clientX - flashcardPointerStart.current));
    flashcardDragCurrent.current = nextDrag;
    setFlashcardDragX(nextDrag);
  };
  const endFlashcardSwipe = () => {
    if (flashcardPointerStart.current === null) return;
    flashcardPointerStart.current = null;
    const direction = flashcardDragCurrent.current;
    if (Math.abs(direction) >= 85) {
      // Pointer-up is normally followed by a click event on the same card.
      // Ignore that synthetic trailing click; otherwise it can flip the freshly
      // reset next card straight back to BACK.
      suppressFlashcardClick.current = true;
      gradeFlashcard(direction > 0);
      window.setTimeout(() => { suppressFlashcardClick.current = false; }, 0);
    } else {
      flashcardDragCurrent.current = 0;
      setFlashcardDragX(0);
    }
  };
  const retryIncorrect = () => {
    setReviewScope("incorrect");
    if (mode === "comprehension") {
      setComprehensionScope("all");
      prepareComprehension("all", true, doc.analysis.questions.length, "incorrect");
    } else { setQuizRun((value) => value + 1); clearRun(); }
    if (mode === "flashcard") setFlashcardQueue(preparedQuestions.filter((item): item is FlashcardQuestion => item.kind === "flashcard" && isIncorrect(item)));
    setStarted(true);
  };
  const shuffleAllAgain = () => {
    setReviewScope("all");
    if (mode === "comprehension") {
      setComprehensionScope("all");
      prepareComprehension("all", comprehensionUseAll, comprehensionCount, "all");
      setStarted(true);
      return;
    }
    if (mode === "flashcard") {
      setQuizRun((value) => value + 1); clearRun();
      setFlashcardQueue(preparedQuestions.filter((item): item is FlashcardQuestion => item.kind === "flashcard"));
      setStarted(true);
    } else startQuiz();
  };
  const returnToQuizHome = () => {
    if (doc.analysis.collection) { reset("meaning"); return; }
    setStarted(false);
    setReviewScope("all");
    setMode("comprehension");
    setComprehensionScope("all");
    setComprehensionUseAll(true);
    prepareComprehension("all", true, doc.analysis.questions.length, "all");
  };

  const question = mode === "flashcard" && started ? flashcardQueue[0] : questions[index];
  const selectedOrderingTokens = question?.kind === "ordering" ? orderedTokenIds.map((id) => question.shuffledTokens.find((token) => token.id === id)).filter((token): token is { id: string; text: string } => Boolean(token)) : [];
  const availableOrderingTokens = question?.kind === "ordering" ? question.shuffledTokens.filter((token) => !orderedTokenIds.includes(token.id)) : [];
  const currentFlashcardRetryCount = question?.kind === "flashcard" ? (flashcardRetryByWord[question.wordId] ?? 0) : 0;
  const availableComprehensionCount = comprehensionScope === "incorrect" ? missedComprehensionIds.length : doc.analysis.questions.length;
  const emptyTitle = reviewScope === "new" ? "선택한 범위에 최근 생성한 문제가 없어요." : reviewScope === "starred" ? "선택한 범위에 별표한 문제가 없어요." : reviewScope === "incorrect" ? "선택한 범위에 남은 오답이 없어요." : mode === "comprehension" && comprehensionScope === "incorrect" ? "현재 저장된 본문 내용 퀴즈 오답이 없어요." : mode === "ordering" ? orderingScope === "difficult" ? "‘어려운 문장’으로 체크한 문장이 없어요." : "출제할 문장을 선택해 주세요." : "단어 퀴즈를 만들 단어가 없어요.";
  const emptyDescription = reviewScope !== "all" ? reviewScope === "new" ? "문제를 추가 생성한 뒤 최근 생성 문제만 선택해 주세요." : "다른 세트나 전체 문제를 선택하세요. 퀴즈의 ☆ 버튼으로 별표할 수 있어요." : mode === "comprehension" ? "전체 문제에서 새로 풀거나, 틀린 문제가 생기면 오답만 다시 풀 수 있어요." : mode === "ordering" ? orderingScope === "difficult" ? "본문 학습에서 문장에 ‘어려운 문장 체크’를 표시해 주세요." : "직접 선택에서 한 문장 이상 골라 주세요." : "본문에서 단어를 저장한 뒤 다시 시작해 주세요.";

  const generationRunning = generationJob?.status === "running";

  return <main className="tool-page quiz-page" aria-label="학습 퀴즈">
    <div className="tool-heading"><div><span className="eyebrow">ACTIVE RECALL</span><h1>학습 퀴즈</h1><p>{doc.title} · 본문 내용 퀴즈, 단어 퀴즈, 빈칸, 플래시카드와 어순 배열을 연습하세요.</p></div><button className="outline-button" onClick={onClose}>본문으로</button></div>
    <div className="quiz-modes"><button className={mode === "comprehension" ? "active" : ""} onClick={() => { setStarted(false); setReviewScope("all"); prepareComprehension(comprehensionScope, comprehensionUseAll, comprehensionCount, "all"); }}>본문 내용 퀴즈</button><button className={mode === "meaning" ? "active" : ""} onClick={() => reset("meaning")}>단어 퀴즈</button><button className={mode === "flashcard" ? "active" : ""} onClick={() => reset("flashcard")}>플래시카드</button><button className={mode === "cloze" ? "active" : ""} onClick={() => reset("cloze")}>빈칸 완성</button><button className={mode === "ordering" ? "active" : ""} onClick={() => reset("ordering")}>어순 배열</button></div>

    {!started && mode === "comprehension" && <section className="quiz-settings">
      <div className="quiz-setting-row"><strong>출제 범위</strong><div className="scope-buttons"><button className={comprehensionScope === "all" ? "active" : ""} onClick={() => { setComprehensionScope("all"); prepareComprehension("all"); }}>전체 문제</button><button className={comprehensionScope === "incorrect" ? "active" : ""} onClick={() => { setComprehensionScope("incorrect"); prepareComprehension("incorrect"); }}>오답만 <b>{missedComprehensionIds.length}</b></button></div></div>
      <div className="quiz-setting-row"><strong>문제 수</strong><label className="all-count-toggle"><input type="checkbox" checked={comprehensionUseAll} onChange={(event) => { setComprehensionUseAll(event.target.checked); prepareComprehension(comprehensionScope, event.target.checked); }} />전체 출제</label><label className="number-picker"><input type="number" min="1" max={Math.max(1, availableComprehensionCount)} disabled={comprehensionUseAll} value={Math.min(comprehensionCount, Math.max(1, availableComprehensionCount))} onChange={(event) => { const count = Math.max(1, Number(event.target.value)); setComprehensionCount(count); prepareComprehension(comprehensionScope, false, count); }} />개</label><button className="reshuffle-button" onClick={() => prepareComprehension()}>↻ 새로 섞어 출제</button></div>
      <div className="quiz-setting-row generation-row"><strong>문제 추가</strong><label className="number-picker"><input type="number" min="1" max={MAX_COMPREHENSION_GENERATION_COUNT} value={generationCount} onChange={(event) => setGenerationCount(Math.max(1, Math.min(MAX_COMPREHENSION_GENERATION_COUNT, Number(event.target.value) || 1)))} />개</label><button className="generate-button" disabled={generationRunning} onClick={() => onGenerate("comprehension", generationCount)}>{generationRunning ? "생성 진행 중…" : "✦ AI 본문 내용 퀴즈 추가"}</button><small>한 번에 최대 {MAX_COMPREHENSION_GENERATION_COUNT}개 · 다른 화면으로 이동해도 계속 생성됩니다.</small></div>
      <p className="scope-summary">현재 범위 {availableComprehensionCount}문제 · 틀린 문제는 자동으로 오답 목록에 저장됩니다.</p>
    </section>}

    {!started && (mode === "meaning" || mode === "flashcard" || mode === "cloze") && <section className="quiz-settings compact">
      {(mode === "meaning" || mode === "flashcard") && <div className="quiz-setting-row"><strong>학습 방향</strong><div className="scope-buttons"><button className={vocabDirection === "english-korean" ? "active" : ""} onClick={() => { setVocabDirection("english-korean"); reset(mode); }}>영어 → 한글</button><button className={vocabDirection === "korean-english" ? "active" : ""} onClick={() => { setVocabDirection("korean-english"); reset(mode); }}>한글 → 영어</button></div></div>}
      {mode === "meaning" && <div className="quiz-setting-row"><strong>답변 방식</strong><div className="scope-buttons"><button className={vocabFormat === "choice" ? "active" : ""} onClick={() => { setVocabFormat("choice"); reset("meaning"); }}>선택형</button><button className={vocabFormat === "written" ? "active" : ""} onClick={() => { setVocabFormat("written"); reset("meaning"); }}>서술형</button></div></div>}
      <div className="quiz-setting-row"><strong>단어장 세트</strong><label><select aria-label="출제할 단어장 세트" value={selectedSet} onChange={(event) => { setSelectedSet(event.target.value); reset(mode); }}><option value="all">전체 세트 · {words.length}개</option>{vocabularySets.map((set, setIndex) => <option key={setIndex} value={setIndex}>세트 {setIndex + 1} · {set.length}개</option>)}{mode === "cloze" && <option value="generated">AI 추가 문제만</option>}</select></label><button className="reshuffle-button" onClick={() => reset(mode)}>↻ 다시 섞기</button></div>
      <p className="scope-summary">단어장에서 정한 {studySettings.setSize}개 단위 세트를 그대로 사용합니다.{mode === "cloze" && selectedSet === "all" ? " 전체 세트에는 AI 추가 문제도 포함됩니다." : ""}</p>
      {mode === "cloze" && <div className="quiz-setting-row generation-row"><strong>문제 추가</strong><label className="number-picker"><input type="number" min="1" max={MAX_CLOZE_GENERATION_COUNT} value={generationCount} onChange={(event) => setGenerationCount(Math.max(1, Math.min(MAX_CLOZE_GENERATION_COUNT, Number(event.target.value) || 1)))} />개</label><button className="generate-button" disabled={generationRunning} onClick={() => onGenerate("cloze", generationCount)}>{generationRunning ? "생성 진행 중…" : "＋ 빈칸 문제 추가 생성"}</button><small>본문의 문장과 핵심 어휘로 새 문제를 만듭니다.</small></div>}
    </section>}

    {!started && mode === "ordering" && <section className="ordering-setup">
      <div className="ordering-setting"><strong>출제 범위</strong><div className="scope-buttons"><button className={orderingScope === "all" ? "active" : ""} onClick={() => updateOrderingScope("all")}>전체 문장</button><button className={orderingScope === "difficult" ? "active" : ""} onClick={() => updateOrderingScope("difficult")}>어려운 문장 체크</button><button className={orderingScope === "selected" ? "active" : ""} onClick={() => updateOrderingScope("selected")}>직접 선택</button></div><button className="reshuffle-button" onClick={() => reset("ordering")}>↻ 문장·단어 다시 섞기</button></div>
      <label className="excerpt-toggle"><input type="checkbox" checked={shortenLongSentence} onChange={(event) => { setShortenLongSentence(event.target.checked); reset("ordering"); }} /><span><b>긴 문장은 핵심 일부만 출제</b><small>짧은 문장은 전체를 사용하고, 긴 문장은 관계사·접속사·완료/수동·준동사 등 중요 문법이 있는 구간을 우선 골라요.</small></span></label>
      {orderingScope === "difficult" && <p className="scope-summary">‘어려운 문장’으로 체크한 문장 {progress.bookmarked_sentence_ids.length}개를 매번 섞어서 출제합니다.</p>}
      {orderingScope === "selected" && <div className="sentence-picker"><header><span>원하는 문장을 골라 주세요.</span><div><button onClick={() => { setSelectedSentenceIds(doc.analysis.sentences.map((sentence) => sentence.id)); reset("ordering"); }}>전체 선택</button><button onClick={() => { setSelectedSentenceIds([]); reset("ordering"); }}>선택 해제</button></div></header>{doc.analysis.sentences.map((sentence) => <label key={sentence.id}><input type="checkbox" checked={selectedSentenceIds.includes(sentence.id)} onChange={() => updateSentenceSelection(sentence.id)} /><span><b>{sentence.id}</b>{sentence.english}</span></label>)}</div>}
    </section>}

    {!started && <section className="quiz-settings compact"><div className="quiz-setting-row"><strong>복습 범위</strong><div className="scope-buttons">{([ ["all", "전체 문제"], ["incorrect", "오답만 풀기"], ["starred", "별표한 문제만"], ...((mode === "comprehension" || mode === "cloze") ? [["new", "최근 생성 문제만"] as const] : []) ] as const).map(([scope, label]) => <button key={scope} className={reviewScope === scope ? "active" : ""} onClick={() => { setReviewScope(scope); if (mode === "comprehension") prepareComprehension(scope === "new" ? "all" : comprehensionScope, comprehensionUseAll, comprehensionCount, scope); else { if (scope === "new") setSelectedSet("generated"); clearRun(); } }}>{label}</button>)}</div></div><p className="scope-summary">{mode === "meaning" || mode === "flashcard" ? `선택한 단어 ${selectedWordIds.length}개 · 출제 ${questions.length}문제${reviewScope !== "all" ? " (출제 범위 필터 적용)" : ""}` : `선택한 세트·출제 범위 안에서 ${questions.length}문제를 풀 수 있어요.`}</p></section>}

    {!started && <section className="quiz-start-panel">
      <div><span>준비가 되면 시작하세요</span><b>설정을 확인한 뒤 문제를 표시합니다.</b></div>
      <button className="primary-button" onClick={startQuiz} disabled={!questions.length}>{questions.length ? `${questions.length}문제 시작 →` : "출제할 문제가 없어요"}</button>
    </section>}

    {started && <div className="quiz-session-toolbar"><span>퀴즈 진행 중{ /^\d+$/.test(selectedSet) && (mode === "meaning" || mode === "cloze" || mode === "flashcard") ? ` · 세트 ${Number(selectedSet) + 1}` : "" } · {questions.length}문제</span><button onClick={() => { setStarted(false); clearRun(); }}>설정 변경</button></div>}

    {started && !done && question && <div className="quiz-question-marks study-marks"><span>문제 표시</span><button aria-label="현재 문제 별표" aria-pressed={studySettings.starred.includes(quizStudyKey(mode, question))} onClick={() => onProgress(toggleStudyMark(progress, quizStudyKey(mode, question), "starred"))}>{studySettings.starred.includes(quizStudyKey(mode, question)) ? "★" : "☆"} 별표</button><button aria-label="현재 문제 더 중요 표시" aria-pressed={studySettings.important.includes(quizStudyKey(mode, question))} onClick={() => onProgress(toggleStudyMark(progress, quizStudyKey(mode, question), "important"))}>! 더 중요</button>{mode === "meaning" && "wordId" in question && question.wordId && <WordPronunciationButton key={`${quizRun}:${index}:${question.wordId}`} word={quizWordsSnapshot.find((word) => word.id === question.wordId)?.word ?? ""} onPlayed={() => { if (!writtenRevealed) writtenInput.current?.focus(); }} />}</div>}

    {started && (!questions.length ? <div className="empty-state"><b>{emptyTitle}</b><p>{emptyDescription}</p></div> : done ? <QuizResult
      score={score}
      total={questions.length}
      summary={score === questions.length && runMistakes.length === 0 ? "완벽해요!" : mode === "comprehension" ? `현재 본문 내용 퀴즈 오답 ${missedComprehensionIds.length}개가 저장되어 있어요.` : mode === "ordering" ? "오답을 확인한 뒤 다시 배열해 보세요." : mode === "flashcard" ? "모른다고 표시한 카드는 남은 카드 뒤로 보내 다시 확인했어요." : "틀린 단어와 정답을 바로 확인할 수 있어요."}
      mistakes={runMistakes}
      studySettings={studySettings}
      onToggleMark={(key, mark) => onProgress(toggleStudyMark(progress, key, mark))}
      canRetryIncorrect={preparedQuestions.some(isIncorrect)}
      onRetryIncorrect={retryIncorrect}
      onShuffleAll={shuffleAllAgain}
      onHome={returnToQuizHome}
      compactFlashcardMistakes={mode === "flashcard"}
      nextSetLabel={nextSetIndex >= 0 ? `다음 세트 ${nextSetIndex + 1} 이어 풀기 →` : undefined}
      onNextSet={nextSetIndex >= 0 ? startNextSet : undefined}
    /> : question?.kind === "ordering" ? <section className="quiz-card ordering-card">
      <header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header>
      <div className="ordering-prompt"><span>{question.shortened ? "긴 문장 일부 출제" : "문장 전체 출제"}</span><h2>영어 어순에 맞게 배열하세요.</h2><p>{question.prompt}</p><OrderingContextExcerpt question={question} /></div>
      <div className={`ordering-answer ${orderingSubmitted ? orderingCorrect ? "correct" : "wrong" : ""}`}>{selectedOrderingTokens.length ? selectedOrderingTokens.map((token) => <button key={token.id} disabled={orderingSubmitted} onClick={() => setOrderedTokenIds((ids) => ids.filter((id) => id !== token.id))}>{token.text}</button>) : <span>아래 단어를 순서대로 선택하세요.</span>}</div>
      <div className="ordering-bank">{availableOrderingTokens.map((token) => <button key={token.id} disabled={orderingSubmitted} onClick={() => setOrderedTokenIds((ids) => [...ids, token.id])}>{token.text}</button>)}</div>
      {!orderingSubmitted ? <div className="ordering-actions"><button onClick={() => setOrderedTokenIds([])} disabled={!orderedTokenIds.length}>초기화</button><button className="primary-button" onClick={submitOrdering} disabled={orderedTokenIds.length !== question.answerTokens.length}>채점하기</button></div> : <div className="answer-note"><b>{orderingCorrect ? "정답입니다" : "정답을 확인하세요"}</b><p>{question.answerTokens.join(" ")}</p><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></div>}
    </section> : question?.kind === "written" ? <section className="quiz-card written-card"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header><h2>{question.prompt}</h2><div className="written-response"><input ref={writtenInput} autoFocus value={writtenAnswer} disabled={writtenRevealed} onChange={(event) => setWrittenAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!event.repeat && writtenAnswer.trim()) setWrittenRevealed(true); } }} placeholder="정답을 직접 입력하세요" /><button className="primary-button" disabled={!writtenAnswer.trim() || writtenRevealed} onClick={() => setWrittenRevealed(true)}>정답 확인</button></div>{writtenRevealed && <div className="answer-note written-note"><div className="written-answer-highlight"><small>정답</small><strong>{question.answerText}</strong></div><p>내 답: {writtenAnswer}</p><p className="example-note">{question.explanation}</p>{writtenGraded === null ? <div className="self-grade"><span>← 틀렸어요 · → 맞았어요 · 채점 후 Enter로 다음 문제</span><button onClick={() => gradeWritten(false)}>← 틀렸어요</button><button className="correct-button" onClick={() => gradeWritten(true)}>맞았어요 →</button></div> : <><strong>{writtenGraded ? "정답으로 기록했습니다." : "오답으로 기록했습니다."}</strong><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></>}</div>}</section> : question?.kind === "flashcard" ? <section className="quiz-card flashcard-wrap"><header><span>남은 {flashcardQueue.length} / {questions.length}</span><div><i style={{ width: `${questions.length ? (score / questions.length) * 100 : 0}%` }} /></div><b>{score} memorized</b></header><div className="flashcard-stage"><span className="swipe-label retry" style={{ opacity: Math.max(0, -flashcardDragX / 90) }}>다시 보기</span><span className="swipe-label learned" style={{ opacity: Math.max(0, flashcardDragX / 90) }}>외웠어요</span><div key={`${question.wordId}:${flashcardTurn}`} role="button" tabIndex={0} className={`flashcard ${flashcardFlipped ? "flipped" : ""}`} style={{ transform: `translateX(${flashcardDragX}px) rotate(${flashcardDragX / 18}deg)` }} onClick={() => { if (suppressFlashcardClick.current) { suppressFlashcardClick.current = false; return; } if (!flashcardFlipped) setFlashcardFlipped(true); }} onPointerDown={beginFlashcardSwipe} onPointerMove={moveFlashcardSwipe} onPointerUp={endFlashcardSwipe} onPointerCancel={endFlashcardSwipe}><span>{flashcardFlipped ? "BACK" : "FRONT"}</span><strong>{flashcardFlipped ? question.back : question.front}</strong>{flashcardFlipped ? <small>{question.example}<em>{question.translation}</em></small> : <small>클릭 또는 Enter · Space로 답을 확인하세요.</small>}</div></div><p className="flashcard-swipe-help">Enter · Space로 정답 확인 · ← 다시 보기 · → 외웠어요. 카드를 좌우로 밀어도 돼요.{currentFlashcardRetryCount > 0 && <b> · 이 카드 재도전 {currentFlashcardRetryCount}회</b>}</p>{flashcardFlipped && <div className="flashcard-actions"><button onClick={() => gradeFlashcard(false)}>← 다시 보기</button><button className="primary-button" onClick={() => gradeFlashcard(true)}>외웠어요 →</button></div>}</section> : question?.kind === "choice" ? <section className="quiz-card"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header><h2>{question.prompt}</h2><div className="options">{question.options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} className={picked === null ? "" : optionIndex === question.answer ? "correct" : optionIndex === picked ? "wrong" : "muted"} onClick={() => answer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{picked !== null && <div className="answer-note"><b>{picked === question.answer ? "정답입니다" : "정답을 확인하세요"}</b><p>{question.explanation}</p><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></div>}</section> : null)}
  </main>;
}
