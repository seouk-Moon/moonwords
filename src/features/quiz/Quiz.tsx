import { useEffect, useMemo, useRef, useState } from "react";
import { buildOrderingExercise } from "../../lib/ordering-quiz";
import { shuffle } from "../../lib/app-utils";
import type { StudyDocument, StudyProgress, VocabularyItem, ReadingQuestion } from "../../types";
import type { ChoiceQuizQuestion, ComprehensionScope, FlashcardQuestion, OrderingQuizQuestion, OrderingScope, QuizGenerationJob, QuizGenerationType, QuizMistakeReviewItem, QuizMode, QuizQuestion, VocabDirection, VocabFormat, WrittenQuizQuestion } from "../../app-types";
import { missedComprehensionKey, readMissedComprehensionIds } from "./quiz-utils";
import { QuizResult } from "./QuizResult";
import { OrderingContextExcerpt } from "./OrderingContextExcerpt";

export function Quiz({ doc, words, progress, generationJob, onClose, onGenerate, onProgress, onResult, onQuestionAnswered, onQuizComplete }: { doc: StudyDocument; words: VocabularyItem[]; progress: StudyProgress; generationJob: QuizGenerationJob | null; onClose: () => void; onGenerate: (type: QuizGenerationType, count: number) => void; onProgress: (next: StudyProgress) => void; onResult: (id: string | undefined, correct: boolean) => void; onQuestionAnswered: (mode: QuizMode, correct: boolean, options?: { wordId?: string; sentenceId?: number }) => void; onQuizComplete: (mode: QuizMode, score: number, questionCount: number) => void }) {
  const [mode, setMode] = useState<QuizMode>("comprehension");
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
  const [comprehensionCount, setComprehensionCount] = useState(Math.max(1, Math.min(5, doc.analysis.questions.length)));
  const [activeComprehensionIds, setActiveComprehensionIds] = useState<number[]>(() => shuffle(doc.analysis.questions.map((_, questionIndex) => questionIndex)));

  const [vocabDirection, setVocabDirection] = useState<VocabDirection>("english-korean");
  const [vocabFormat, setVocabFormat] = useState<VocabFormat>("choice");
  const [vocabUseAll, setVocabUseAll] = useState(false);
  const [vocabCount, setVocabCount] = useState(10);
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

  const questions = useMemo<QuizQuestion[]>(() => {
    void quizRun;
    if (mode === "comprehension") return activeComprehensionIds.flatMap((questionId): ChoiceQuizQuestion[] => {
      const question = doc.analysis.questions[questionId] as ReadingQuestion | undefined;
      return question ? [{ kind: "choice", prompt: question.question, options: question.options, answer: question.answer, explanation: question.explanation, sourceQuestionId: questionId }] : [];
    });
    if (mode === "ordering") {
      const targetSentences = orderingScope === "all"
        ? doc.analysis.sentences
        : orderingScope === "difficult"
          ? doc.analysis.sentences.filter((sentence) => progress.bookmarked_sentence_ids.includes(sentence.id))
          : doc.analysis.sentences.filter((sentence) => selectedSentenceIds.includes(sentence.id));

      return shuffle(targetSentences).flatMap((sentence): OrderingQuizQuestion[] => {
        const protectedPhrases = [
          ...sentence.keywords.map((keyword) => keyword.word),
          ...quizWordsSnapshot.filter((word) => word.sentence_id === sentence.id).map((word) => word.word),
        ];
        const exercise = buildOrderingExercise(sentence.english, protectedPhrases, shortenLongSentence);
        if (exercise.answerTokens.length < 2) return [];
        const sentenceIndex = doc.analysis.sentences.findIndex((item) => item.id === sentence.id);
        const contextBefore = sentenceIndex > 0 ? doc.analysis.sentences[sentenceIndex - 1]?.english : undefined;
        const contextAfter = sentenceIndex >= 0 && sentenceIndex + 1 < doc.analysis.sentences.length
          ? doc.analysis.sentences[sentenceIndex + 1]?.english
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
      const savedWordQuestions = quizWordsSnapshot.map((word): ChoiceQuizQuestion => {
        const blank = word.source_sentence.replace(new RegExp(`\\b${word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "______");
        const alternatives = shuffle([...new Set(quizWordsSnapshot.filter((item) => item.id !== word.id).map((item) => item.word))]).slice(0, 3);
        const options = shuffle([word.word, ...alternatives]);
        return { kind: "choice", prompt: blank, options, answer: options.indexOf(word.word), explanation: `${word.word} — ${word.meaning}`, wordId: word.id, sourceSentence: word.source_sentence, testedPart: word.word };
      });
      const generatedQuestions = (doc.analysis.cloze_questions ?? []).map((question): ChoiceQuizQuestion => {
        const answerText = question.options[question.answer] ?? "";
        const sourceSentence = answerText && /_{3,}/.test(question.question)
          ? question.question.replace(/_{3,}/, answerText)
          : undefined;
        return { kind: "choice", prompt: question.question, options: question.options, answer: question.answer, explanation: question.explanation, sourceSentence, testedPart: answerText || undefined };
      });
      const pool = shuffle([...savedWordQuestions, ...generatedQuestions]);
      return vocabUseAll ? pool : pool.slice(0, Math.min(Math.max(vocabCount, 1), pool.length));
    }
    if (!quizWordsSnapshot.length) return [];
    const targetWords = shuffle(quizWordsSnapshot).slice(0, vocabUseAll ? quizWordsSnapshot.length : Math.min(Math.max(vocabCount, 1), quizWordsSnapshot.length));
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
      const alternatives = shuffle([...new Set(candidates.filter((candidate) => candidate !== answerText))]).slice(0, 3);
      const options = shuffle([answerText, ...alternatives]);
      return { kind: "choice", prompt, options, answer: options.indexOf(answerText), explanation: word.source_sentence, wordId: word.id, sourceSentence: word.source_sentence, testedPart: word.word };
    });
    return [];
  }, [mode, quizWordsSnapshot, doc, orderingScope, selectedSentenceIds, shortenLongSentence, progress.bookmarked_sentence_ids, activeComprehensionIds, vocabDirection, vocabFormat, vocabUseAll, vocabCount, quizRun]);

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
  const prepareComprehension = (scope = comprehensionScope, useAll = comprehensionUseAll, count = comprehensionCount) => {
    const allIds = doc.analysis.questions.map((_, questionIndex) => questionIndex);
    const pool = scope === "incorrect" ? missedComprehensionIds.filter((id) => allIds.includes(id)) : allIds;
    const limit = useAll ? pool.length : Math.min(Math.max(count, 1), pool.length);
    setMode("comprehension"); setActiveComprehensionIds(shuffle(pool).slice(0, limit)); setQuizRun((value) => value + 1); clearRun();
  };
  const reset = (nextMode = mode) => {
    setStarted(false);
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
    onProgress({ ...progress, sentence_notes: { ...(progress.sentence_notes ?? {}), [missedComprehensionKey]: JSON.stringify(next) }, last_studied_at: new Date().toISOString() });
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
      prompt: question.prompt,
      selected: question.options[choice] ?? "",
      answer: question.options[question.answer] ?? "",
      explanation: question.explanation,
      sourceSentence: question.sourceSentence,
      testedPart: question.testedPart,
    });
    if (question.sourceQuestionId !== undefined) saveMissedComprehensionIds(question.sourceQuestionId, correct);
    onResult(question.wordId, correct);
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
      prompt: question.prompt,
      selected: writtenAnswer,
      answer: question.answerText,
      explanation: question.explanation,
      sourceSentence: question.sourceSentence,
      testedPart: question.testedPart,
    });
    onResult(question.wordId, correct);
    onQuestionAnswered(mode, correct, { wordId: question.wordId });
  };
  const gradeFlashcard = (correct: boolean) => {
    const question = flashcardQueue[0];
    if (!question || !flashcardFlipped) return;
    onResult(question.wordId, correct);
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
  const submitOrdering = () => {
    const question = questions[index];
    if (question?.kind !== "ordering" || orderingSubmitted || orderedTokenIds.length !== question.answerTokens.length) return;
    const answerTokens = orderedTokenIds.map((id) => question.shuffledTokens.find((token) => token.id === id)?.text ?? "");
    const correct = answerTokens.every((token, tokenIndex) => token === question.answerTokens[tokenIndex]);
    setOrderingCorrect(correct); setOrderingSubmitted(true);
    setAnsweredCount((value) => value + 1);
    onQuestionAnswered(mode, correct, { sentenceId: question.sentenceId });
    if (correct) setScore((value) => value + 1);
    else rememberMistake({
      id: `ordering:${quizRun}:${index}:${question.sentenceId}`,
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
    if (mode !== "comprehension" || !missedComprehensionIds.length) return;
    setComprehensionScope("incorrect");
    setComprehensionUseAll(true);
    prepareComprehension("incorrect", true, missedComprehensionIds.length);
    setStarted(true);
  };
  const shuffleAllAgain = () => {
    if (mode === "comprehension") {
      setComprehensionScope("all");
      prepareComprehension("all", comprehensionUseAll, comprehensionCount);
      setStarted(true);
      return;
    }
    startQuiz();
  };
  const returnToQuizHome = () => {
    setStarted(false);
    setMode("comprehension");
    setComprehensionScope("all");
    setComprehensionUseAll(true);
    prepareComprehension("all", true, doc.analysis.questions.length);
  };

  const question = mode === "flashcard" && started ? flashcardQueue[0] : questions[index];
  const selectedOrderingTokens = question?.kind === "ordering" ? orderedTokenIds.map((id) => question.shuffledTokens.find((token) => token.id === id)).filter((token): token is { id: string; text: string } => Boolean(token)) : [];
  const availableOrderingTokens = question?.kind === "ordering" ? question.shuffledTokens.filter((token) => !orderedTokenIds.includes(token.id)) : [];
  const currentFlashcardRetryCount = question?.kind === "flashcard" ? (flashcardRetryByWord[question.wordId] ?? 0) : 0;
  const availableComprehensionCount = comprehensionScope === "incorrect" ? missedComprehensionIds.length : doc.analysis.questions.length;
  const emptyTitle = mode === "comprehension" && comprehensionScope === "incorrect" ? "현재 저장된 본문 이해 오답이 없어요." : mode === "ordering" ? orderingScope === "difficult" ? "‘어려운 문장’으로 체크한 문장이 없어요." : "출제할 문장을 선택해 주세요." : "단어 퀴즈를 만들 단어가 없어요.";
  const emptyDescription = mode === "comprehension" ? "전체 문제에서 새로 풀거나, 틀린 문제가 생기면 오답만 다시 풀 수 있어요." : mode === "ordering" ? orderingScope === "difficult" ? "본문 학습에서 문장에 ‘어려운 문장 체크’를 표시해 주세요." : "직접 선택에서 한 문장 이상 골라 주세요." : "본문에서 단어를 저장한 뒤 다시 시작해 주세요.";

  const generationRunning = generationJob?.status === "running";

  return <main className="tool-page quiz-page" aria-label="학습 퀴즈">
    <div className="tool-heading"><div><span className="eyebrow">ACTIVE RECALL</span><h1>학습 퀴즈</h1><p>{doc.title} · 본문 이해, 단어 뜻, 빈칸, 플래시카드와 어순 배열을 연습하세요.</p></div><button className="outline-button" onClick={onClose}>본문으로</button></div>
    <div className="quiz-modes"><button className={mode === "comprehension" ? "active" : ""} onClick={() => { setStarted(false); prepareComprehension(); }}>본문 이해</button><button className={mode === "meaning" ? "active" : ""} onClick={() => reset("meaning")}>단어 뜻</button><button className={mode === "flashcard" ? "active" : ""} onClick={() => reset("flashcard")}>플래시카드</button><button className={mode === "cloze" ? "active" : ""} onClick={() => reset("cloze")}>빈칸 완성</button><button className={mode === "ordering" ? "active" : ""} onClick={() => reset("ordering")}>어순 배열</button></div>

    {!started && mode === "comprehension" && <section className="quiz-settings">
      <div className="quiz-setting-row"><strong>출제 범위</strong><div className="scope-buttons"><button className={comprehensionScope === "all" ? "active" : ""} onClick={() => { setComprehensionScope("all"); prepareComprehension("all"); }}>전체 문제</button><button className={comprehensionScope === "incorrect" ? "active" : ""} onClick={() => { setComprehensionScope("incorrect"); prepareComprehension("incorrect"); }}>오답만 <b>{missedComprehensionIds.length}</b></button></div></div>
      <div className="quiz-setting-row"><strong>문제 수</strong><label className="all-count-toggle"><input type="checkbox" checked={comprehensionUseAll} onChange={(event) => { setComprehensionUseAll(event.target.checked); prepareComprehension(comprehensionScope, event.target.checked); }} />전체 출제</label><label className="number-picker"><input type="number" min="1" max={Math.max(1, availableComprehensionCount)} disabled={comprehensionUseAll} value={Math.min(comprehensionCount, Math.max(1, availableComprehensionCount))} onChange={(event) => { const count = Math.max(1, Number(event.target.value)); setComprehensionCount(count); prepareComprehension(comprehensionScope, false, count); }} />개</label><button className="reshuffle-button" onClick={() => prepareComprehension()}>↻ 새로 섞어 출제</button></div>
      <div className="quiz-setting-row generation-row"><strong>문제 추가</strong><label className="number-picker"><input type="number" min="1" max="5" value={generationCount} onChange={(event) => setGenerationCount(Math.max(1, Math.min(5, Number(event.target.value))))} />개</label><button className="generate-button" disabled={generationRunning} onClick={() => onGenerate("comprehension", generationCount)}>{generationRunning ? "생성 진행 중…" : "✦ AI 본문 이해 문제 추가"}</button><small>다른 화면으로 이동해도 계속 생성됩니다.</small></div>
      <p className="scope-summary">현재 범위 {availableComprehensionCount}문제 · 틀린 문제는 자동으로 오답 목록에 저장됩니다.</p>
    </section>}

    {!started && (mode === "meaning" || mode === "flashcard" || mode === "cloze") && <section className="quiz-settings compact">
      {(mode === "meaning" || mode === "flashcard") && <div className="quiz-setting-row"><strong>학습 방향</strong><div className="scope-buttons"><button className={vocabDirection === "english-korean" ? "active" : ""} onClick={() => { setVocabDirection("english-korean"); reset(mode); }}>영어 → 한글</button><button className={vocabDirection === "korean-english" ? "active" : ""} onClick={() => { setVocabDirection("korean-english"); reset(mode); }}>한글 → 영어</button></div></div>}
      {mode === "meaning" && <div className="quiz-setting-row"><strong>답변 방식</strong><div className="scope-buttons"><button className={vocabFormat === "choice" ? "active" : ""} onClick={() => { setVocabFormat("choice"); reset("meaning"); }}>선택형</button><button className={vocabFormat === "written" ? "active" : ""} onClick={() => { setVocabFormat("written"); reset("meaning"); }}>서술형</button></div></div>}
      <div className="quiz-setting-row"><strong>{mode === "flashcard" ? "묶음당 카드" : mode === "cloze" ? "문제 수" : "단어 수"}</strong><label className="all-count-toggle"><input type="checkbox" checked={vocabUseAll} onChange={(event) => { setVocabUseAll(event.target.checked); reset(mode); }} />전체</label><label className="number-picker"><input type="number" min="1" max={Math.max(1, mode === "cloze" ? words.length + (doc.analysis.cloze_questions?.length ?? 0) : words.length)} disabled={vocabUseAll} value={Math.min(vocabCount, Math.max(1, mode === "cloze" ? words.length + (doc.analysis.cloze_questions?.length ?? 0) : words.length))} onChange={(event) => { setVocabCount(Math.max(1, Number(event.target.value))); reset(mode); }} />개</label><button className="reshuffle-button" onClick={() => reset(mode)}>↻ 다시 섞기</button></div>
      {mode === "cloze" && <div className="quiz-setting-row generation-row"><strong>문제 추가</strong><label className="number-picker"><input type="number" min="1" max="20" value={generationCount} onChange={(event) => setGenerationCount(Math.max(1, Math.min(20, Number(event.target.value))))} />개</label><button className="generate-button" disabled={generationRunning} onClick={() => onGenerate("cloze", generationCount)}>{generationRunning ? "생성 진행 중…" : "＋ 빈칸 문제 추가 생성"}</button><small>본문의 문장과 핵심 어휘로 새 문제를 만듭니다.</small></div>}
    </section>}

    {!started && mode === "ordering" && <section className="ordering-setup">
      <div className="ordering-setting"><strong>출제 범위</strong><div className="scope-buttons"><button className={orderingScope === "all" ? "active" : ""} onClick={() => updateOrderingScope("all")}>전체 문장</button><button className={orderingScope === "difficult" ? "active" : ""} onClick={() => updateOrderingScope("difficult")}>어려운 문장 체크</button><button className={orderingScope === "selected" ? "active" : ""} onClick={() => updateOrderingScope("selected")}>직접 선택</button></div><button className="reshuffle-button" onClick={() => reset("ordering")}>↻ 문장·단어 다시 섞기</button></div>
      <label className="excerpt-toggle"><input type="checkbox" checked={shortenLongSentence} onChange={(event) => { setShortenLongSentence(event.target.checked); reset("ordering"); }} /><span><b>긴 문장은 핵심 일부만 출제</b><small>짧은 문장은 전체를 사용하고, 긴 문장은 관계사·접속사·완료/수동·준동사 등 중요 문법이 있는 구간을 우선 골라요.</small></span></label>
      {orderingScope === "difficult" && <p className="scope-summary">‘어려운 문장’으로 체크한 문장 {progress.bookmarked_sentence_ids.length}개를 매번 섞어서 출제합니다.</p>}
      {orderingScope === "selected" && <div className="sentence-picker"><header><span>원하는 문장을 골라 주세요.</span><div><button onClick={() => { setSelectedSentenceIds(doc.analysis.sentences.map((sentence) => sentence.id)); reset("ordering"); }}>전체 선택</button><button onClick={() => { setSelectedSentenceIds([]); reset("ordering"); }}>선택 해제</button></div></header>{doc.analysis.sentences.map((sentence) => <label key={sentence.id}><input type="checkbox" checked={selectedSentenceIds.includes(sentence.id)} onChange={() => updateSentenceSelection(sentence.id)} /><span><b>{sentence.id}</b>{sentence.english}</span></label>)}</div>}
    </section>}

    {!started && <section className="quiz-start-panel">
      <div><span>준비가 되면 시작하세요</span><b>설정을 확인한 뒤 문제를 표시합니다.</b></div>
      <button className="primary-button" onClick={startQuiz} disabled={!questions.length}>{questions.length ? `${questions.length}문제 시작 →` : "출제할 문제가 없어요"}</button>
    </section>}

    {started && <div className="quiz-session-toolbar"><span>퀴즈 진행 중 · {questions.length}문제</span><button onClick={() => { setStarted(false); clearRun(); }}>설정 변경</button></div>}

    {started && (!questions.length ? <div className="empty-state"><b>{emptyTitle}</b><p>{emptyDescription}</p></div> : done ? <QuizResult
      score={score}
      total={questions.length}
      summary={score === questions.length && runMistakes.length === 0 ? "완벽해요!" : mode === "comprehension" ? `현재 본문 이해 오답 ${missedComprehensionIds.length}개가 저장되어 있어요.` : mode === "ordering" ? "오답을 확인한 뒤 다시 배열해 보세요." : mode === "flashcard" ? "모른다고 표시한 카드는 남은 카드 뒤로 보내 다시 확인했어요." : "틀린 단어와 정답을 바로 확인할 수 있어요."}
      mistakes={runMistakes}
      canRetryIncorrect={mode === "comprehension" && missedComprehensionIds.length > 0}
      onRetryIncorrect={retryIncorrect}
      onShuffleAll={shuffleAllAgain}
      onHome={returnToQuizHome}
      compactFlashcardMistakes={mode === "flashcard"}
    /> : question?.kind === "ordering" ? <section className="quiz-card ordering-card">
      <header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header>
      <div className="ordering-prompt"><span>{question.shortened ? "긴 문장 일부 출제" : "문장 전체 출제"}</span><h2>영어 어순에 맞게 배열하세요.</h2><p>{question.prompt}</p><OrderingContextExcerpt question={question} /></div>
      <div className={`ordering-answer ${orderingSubmitted ? orderingCorrect ? "correct" : "wrong" : ""}`}>{selectedOrderingTokens.length ? selectedOrderingTokens.map((token) => <button key={token.id} disabled={orderingSubmitted} onClick={() => setOrderedTokenIds((ids) => ids.filter((id) => id !== token.id))}>{token.text}</button>) : <span>아래 단어를 순서대로 선택하세요.</span>}</div>
      <div className="ordering-bank">{availableOrderingTokens.map((token) => <button key={token.id} disabled={orderingSubmitted} onClick={() => setOrderedTokenIds((ids) => [...ids, token.id])}>{token.text}</button>)}</div>
      {!orderingSubmitted ? <div className="ordering-actions"><button onClick={() => setOrderedTokenIds([])} disabled={!orderedTokenIds.length}>초기화</button><button className="primary-button" onClick={submitOrdering} disabled={orderedTokenIds.length !== question.answerTokens.length}>채점하기</button></div> : <div className="answer-note"><b>{orderingCorrect ? "정답입니다" : "정답을 확인하세요"}</b><p>{question.answerTokens.join(" ")}</p><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></div>}
    </section> : question?.kind === "written" ? <section className="quiz-card written-card"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header><h2>{question.prompt}</h2><div className="written-response"><input autoFocus value={writtenAnswer} disabled={writtenRevealed} onChange={(event) => setWrittenAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && writtenAnswer.trim()) setWrittenRevealed(true); }} placeholder="정답을 직접 입력하세요" /><button className="primary-button" disabled={!writtenAnswer.trim() || writtenRevealed} onClick={() => setWrittenRevealed(true)}>정답 확인</button></div>{writtenRevealed && <div className="answer-note written-note"><b>정답: {question.answerText}</b><p>내 답: {writtenAnswer}</p><p className="example-note">{question.explanation}</p>{writtenGraded === null ? <div className="self-grade"><span>내 답을 스스로 채점해 주세요.</span><button onClick={() => gradeWritten(false)}>틀렸어요</button><button className="correct-button" onClick={() => gradeWritten(true)}>맞았어요</button></div> : <><strong>{writtenGraded ? "정답으로 기록했습니다." : "오답으로 기록했습니다."}</strong><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></>}</div>}</section> : question?.kind === "flashcard" ? <section className="quiz-card flashcard-wrap"><header><span>남은 {flashcardQueue.length} / {questions.length}</span><div><i style={{ width: `${questions.length ? (score / questions.length) * 100 : 0}%` }} /></div><b>{score} memorized</b></header><div className="flashcard-stage"><span className="swipe-label retry" style={{ opacity: Math.max(0, -flashcardDragX / 90) }}>다시 보기</span><span className="swipe-label learned" style={{ opacity: Math.max(0, flashcardDragX / 90) }}>외웠어요</span><div key={`${question.wordId}:${flashcardTurn}`} role="button" tabIndex={0} className={`flashcard ${flashcardFlipped ? "flipped" : ""}`} style={{ transform: `translateX(${flashcardDragX}px) rotate(${flashcardDragX / 18}deg)` }} onClick={() => { if (suppressFlashcardClick.current) { suppressFlashcardClick.current = false; return; } if (!flashcardFlipped) setFlashcardFlipped(true); }} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !flashcardFlipped) setFlashcardFlipped(true); }} onPointerDown={beginFlashcardSwipe} onPointerMove={moveFlashcardSwipe} onPointerUp={endFlashcardSwipe} onPointerCancel={endFlashcardSwipe}><span>{flashcardFlipped ? "BACK" : "FRONT"}</span><strong>{flashcardFlipped ? question.back : question.front}</strong>{flashcardFlipped ? <small>{question.example}<em>{question.translation}</em></small> : <small>카드를 눌러 답을 확인하세요.</small>}</div></div><p className="flashcard-swipe-help">답을 확인한 뒤 왼쪽은 ‘다시 보기’, 오른쪽은 ‘외웠어요’로 밀어 주세요.{currentFlashcardRetryCount > 0 && <b> · 이 카드 재도전 {currentFlashcardRetryCount}회</b>}</p>{flashcardFlipped && <div className="flashcard-actions"><button onClick={() => gradeFlashcard(false)}>← 다시 보기</button><button className="primary-button" onClick={() => gradeFlashcard(true)}>외웠어요 →</button></div>}</section> : question?.kind === "choice" ? <section className="quiz-card"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header><h2>{question.prompt}</h2><div className="options">{question.options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} className={picked === null ? "" : optionIndex === question.answer ? "correct" : optionIndex === picked ? "wrong" : "muted"} onClick={() => answer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{picked !== null && <div className="answer-note"><b>{picked === question.answer ? "정답입니다" : "정답을 확인하세요"}</b><p>{question.explanation}</p><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></div>}</section> : null)}
  </main>;
}
