import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { cleanSelection, sameLexeme } from "../../lib/app-utils";
import { buildStudySectionGroups } from "../../lib/analysis-normalization";
import { describeCefrLevel, formatCefrLevel } from "../../lib/cefr";
import type { SelectedWord } from "../../app-types";
import type { StudyDocument, StudyProgress, VocabularyItem } from "../../types";
import { HighlightedEnglish } from "./HighlightedEnglish";
import { ListeningControls, PlaybackIcon } from "./ListeningControls";

type Props = {
  doc: StudyDocument;
  words: VocabularyItem[];
  progress: StudyProgress;
  onSaveWord: (word: Omit<VocabularyItem, "id" | "user_id" | "created_at" | "updated_at">) => Promise<void>;
  onDeleteWord: (id: string) => Promise<void>;
  onProgress: (next: StudyProgress) => void;
  onRenameDocument: (documentId: string, title: string) => Promise<void>;
  onFullListeningComplete: () => void;
};

export function StudyView({ doc, words, progress, onSaveWord, onDeleteWord, onProgress, onRenameDocument, onFullListeningComplete }: Props) {
  const [selected, setSelected] = useState<SelectedWord | null>(null);
  const [loadingMeaning, setLoadingMeaning] = useState(false);
  const [lookupHighlight, setLookupHighlight] = useState<{ word: string; sentenceId: number; status: "loading" | "done" } | null>(null);
  const [lookupNotice, setLookupNotice] = useState("");
  const [listeningState, setListeningState] = useState<"idle" | "playing" | "paused">("idle");
  const [speakingSentenceIndex, setSpeakingSentenceIndex] = useState<number | null>(null);
  const [singleSpeakingSentenceIndex, setSingleSpeakingSentenceIndex] = useState<number | null>(null);
  const [singleListeningState, setSingleListeningState] = useState<"idle" | "playing" | "paused">("idle");
  const [chapterListeningKey, setChapterListeningKey] = useState<string | null>(null);
  const [chapterListeningState, setChapterListeningState] = useState<"idle" | "playing" | "paused">("idle");
  const [showFloatingListeningControls, setShowFloatingListeningControls] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.title);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState("");
  const articleRef = useRef<HTMLDivElement>(null);
  const topListeningRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const meaningCache = useRef(new Map<string, string>());
  const activeLookup = useRef("");
  const lookupNoticeTimer = useRef<number | null>(null);
  const listeningRun = useRef(0);
  const playbackPosition = useRef({ sentenceIndex: 0, sentenceTime: 0, startedAt: 0 });
  const sentences = doc.analysis.sentences;
  const studySections = useMemo(() => buildStudySectionGroups(doc.analysis), [doc.analysis]);
  const difficultSentences = progress.bookmarked_sentence_ids;

  const selectWord = useCallback(async () => {
    const selection = window.getSelection();
    const word = cleanSelection(selection?.toString() ?? "");
    if (!word || word.length > 60 || !selection?.rangeCount) return;
    const anchor = selection.anchorNode?.parentElement?.closest<HTMLElement>("[data-sentence]");
    if (!anchor) return;
    const sentenceIndex = Number(anchor.dataset.sentenceIndex);
    const sentenceId = Number(anchor.dataset.sentence);
    const sentence = Number.isInteger(sentenceIndex)
      ? sentences[sentenceIndex]
      : sentences.find((item) => item.id === sentenceId);
    if (!sentence) return;
    const cacheKey = `${sentenceId}:${word.toLowerCase()}`;
    const cached = meaningCache.current.get(cacheKey);
    const saved = words.find((item) => item.sentence_id === sentenceId && sameLexeme(item.word, word));
    const local = sentence.keywords.find((item) => sameLexeme(item.word, word));
    const immediateMeaning = cached ?? saved?.meaning ?? local?.meaning ?? "";
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    activeLookup.current = "";
    setLoadingMeaning(false);
    setSelected({ word, sentenceId, meaning: immediateMeaning, savedId: saved?.id, x: Math.max(12, Math.min(rect.left, window.innerWidth - 322)), y: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 220)) });
    if (!immediateMeaning && supabase) {
      activeLookup.current = cacheKey;
      setLookupHighlight({ word, sentenceId, status: "loading" });
      setLookupNotice("");
      if (lookupNoticeTimer.current !== null) window.clearTimeout(lookupNoticeTimer.current);
      setLoadingMeaning(true);
      let resolvedMeaning = "";
      try {
        const response = await supabase.functions.invoke("process-document", { body: { action: "define", word, sentence: sentence.english, translation: sentence.korean } });
        if (!response.error && response.data?.meaning) {
          resolvedMeaning = String(response.data.meaning);
          meaningCache.current.set(cacheKey, resolvedMeaning);
          setSelected((current) => current && current.sentenceId === sentenceId && current.word === word ? { ...current, meaning: resolvedMeaning } : current);
        }
      } finally {
        if (activeLookup.current === cacheKey) {
          setLoadingMeaning(false);
          if (resolvedMeaning) {
            // Blue means the AI lookup is still running. Switch to green only after
            // the meaning has actually arrived, so mobile users get a clear finish signal.
            setLookupHighlight((current) => current && current.sentenceId === sentenceId && current.word === word ? { ...current, status: "done" } : current);
            setLookupNotice(`✓ ${word} 뜻 찾기 완료`);
            lookupNoticeTimer.current = window.setTimeout(() => setLookupNotice(""), 1800);
          } else {
            // Do not show a misleading "search failed" color for AI lookup. If a
            // network/function call is interrupted, simply remove the loading state.
            setLookupHighlight((current) => current && current.sentenceId === sentenceId && current.word === word ? null : current);
          }
        }
      }
    }
  }, [sentences, words]);

  useEffect(() => () => {
    if (lookupNoticeTimer.current !== null) window.clearTimeout(lookupNoticeTimer.current);
  }, []);

  const openSavedWord = useCallback((word: VocabularyItem, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    activeLookup.current = "";
    setLoadingMeaning(false);
    setSelected({ word: word.word, sentenceId: word.sentence_id, meaning: word.meaning, savedId: word.id, x: Math.max(12, Math.min(rect.left, window.innerWidth - 322)), y: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 220)) });
    window.getSelection()?.removeAllRanges();
  }, []);

  const estimateSentenceDuration = useCallback((text: string) => {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1.2, wordCount / (2.35 * 0.86));
  }, []);

  const sentenceOffsetToCharIndex = useCallback((text: string, offsetSeconds: number) => {
    const duration = estimateSentenceDuration(text);
    if (offsetSeconds <= 0 || !text) return 0;
    const roughIndex = Math.min(text.length - 1, Math.floor((offsetSeconds / duration) * text.length));
    const nextSpace = text.indexOf(" ", roughIndex);
    return nextSpace === -1 ? roughIndex : Math.min(nextSpace + 1, text.length);
  }, [estimateSentenceDuration]);

  const stopListening = useCallback(() => {
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
    playbackPosition.current = { sentenceIndex: 0, sentenceTime: 0, startedAt: 0 };
    setListeningState("idle");
    setSpeakingSentenceIndex(null);
    setSingleSpeakingSentenceIndex(null);
    setSingleListeningState("idle");
    setChapterListeningKey(null);
    setChapterListeningState("idle");
  }, []);

  const playNext = useCallback(function playNext(index: number, run: number, sentenceTime = 0, pauseOnStart = false) {
    if (run !== listeningRun.current) return;
    if (index >= sentences.length) {
      setListeningState("idle");
      setSpeakingSentenceIndex(null);
      playbackPosition.current = { sentenceIndex: 0, sentenceTime: 0, startedAt: 0 };
      onFullListeningComplete();
      return;
    }
    const sentence = sentences[index];
    const duration = estimateSentenceDuration(sentence.english);
    const safeSentenceTime = Math.max(0, Math.min(sentenceTime, Math.max(0, duration - 0.15)));
    const charIndex = sentenceOffsetToCharIndex(sentence.english, safeSentenceTime);
    const remainingText = sentence.english.slice(charIndex).trimStart();
    if (!remainingText) {
      playNext(index + 1, run, 0, pauseOnStart);
      return;
    }
    playbackPosition.current = { sentenceIndex: index, sentenceTime: safeSentenceTime, startedAt: 0 };
    const utterance = new SpeechSynthesisUtterance(remainingText);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    utterance.onstart = () => {
      if (run !== listeningRun.current) return;
      playbackPosition.current.startedAt = pauseOnStart ? 0 : performance.now();
      setSpeakingSentenceIndex(index);
      document.querySelector(`[data-sentence-index="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (pauseOnStart) {
        window.speechSynthesis.pause();
        setListeningState("paused");
      }
    };
    utterance.onend = () => playNext(index + 1, run);
    utterance.onerror = () => {
      if (run === listeningRun.current) stopListening();
    };
    window.speechSynthesis.speak(utterance);
  }, [estimateSentenceDuration, onFullListeningComplete, sentenceOffsetToCharIndex, sentences, stopListening]);

  const startFullListening = () => {
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
    const run = listeningRun.current;
    playbackPosition.current = { sentenceIndex: 0, sentenceTime: 0, startedAt: 0 };
    setSingleSpeakingSentenceIndex(null);
    setSingleListeningState("idle");
    setChapterListeningKey(null);
    setChapterListeningState("idle");
    setListeningState("playing");
    setSpeakingSentenceIndex(null);
    playNext(0, run);
  };

  const playChapterNext = useCallback(function playChapterNext(indices: number[], position: number, run: number, key: string) {
    if (run !== listeningRun.current) return;
    if (position >= indices.length) {
      setChapterListeningKey(null);
      setChapterListeningState("idle");
      setSpeakingSentenceIndex(null);
      return;
    }
    const sentenceIndex = indices[position];
    const sentence = sentences[sentenceIndex];
    if (!sentence) {
      playChapterNext(indices, position + 1, run, key);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(sentence.english);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    utterance.onstart = () => {
      if (run !== listeningRun.current) return;
      setChapterListeningKey(key);
      setChapterListeningState("playing");
      setSpeakingSentenceIndex(sentenceIndex);
      document.querySelector(`[data-sentence-index="${sentenceIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    utterance.onend = () => playChapterNext(indices, position + 1, run, key);
    utterance.onerror = () => { if (run === listeningRun.current) stopListening(); };
    window.speechSynthesis.speak(utterance);
  }, [sentences, stopListening]);

  const toggleChapterListening = (key: string, indices: number[]) => {
    if (chapterListeningKey === key && chapterListeningState === "playing") {
      window.speechSynthesis.pause();
      setChapterListeningState("paused");
      return;
    }
    if (chapterListeningKey === key && chapterListeningState === "paused") {
      window.speechSynthesis.resume();
      setChapterListeningState("playing");
      return;
    }
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
    const run = listeningRun.current;
    setListeningState("idle");
    setSingleSpeakingSentenceIndex(null);
    setSingleListeningState("idle");
    setChapterListeningKey(key);
    setChapterListeningState("playing");
    setSpeakingSentenceIndex(null);
    playChapterNext(indices, 0, run, key);
  };

  const currentSentenceTime = useCallback(() => {
    const position = playbackPosition.current;
    if (listeningState !== "playing" || !position.startedAt) return position.sentenceTime;
    const duration = estimateSentenceDuration(sentences[position.sentenceIndex]?.english ?? "");
    return Math.min(duration, position.sentenceTime + (performance.now() - position.startedAt) / 1000);
  }, [estimateSentenceDuration, listeningState, sentences]);

  const toggleListeningPause = () => {
    if (listeningState === "playing") {
      playbackPosition.current.sentenceTime = currentSentenceTime();
      playbackPosition.current.startedAt = 0;
      window.speechSynthesis.pause();
      setListeningState("paused");
    } else if (listeningState === "paused") {
      window.speechSynthesis.resume();
      playbackPosition.current.startedAt = performance.now();
      setListeningState("playing");
    }
  };

  const seekFullListening = useCallback((deltaSeconds: number) => {
    if (listeningState === "idle" || !sentences.length) return;
    const durations = sentences.map((sentence) => estimateSentenceDuration(sentence.english));
    const currentIndex = Math.max(0, Math.min(playbackPosition.current.sentenceIndex, sentences.length - 1));
    const elapsedBefore = durations.slice(0, currentIndex).reduce((sum, duration) => sum + duration, 0);
    const currentGlobalTime = elapsedBefore + currentSentenceTime();
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    const targetGlobalTime = Math.max(0, Math.min(totalDuration, currentGlobalTime + deltaSeconds));
    let remaining = targetGlobalTime;
    let targetIndex = 0;
    while (targetIndex < durations.length - 1 && remaining >= durations[targetIndex]) {
      remaining -= durations[targetIndex];
      targetIndex += 1;
    }

    const keepPaused = listeningState === "paused";
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
    const run = listeningRun.current;
    setSingleSpeakingSentenceIndex(null);
    setListeningState(keepPaused ? "paused" : "playing");
    playNext(targetIndex, run, remaining, keepPaused);
  }, [currentSentenceTime, estimateSentenceDuration, listeningState, playNext, sentences]);

  useEffect(() => () => {
      listeningRun.current += 1;
      window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const target = topListeningRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setShowFloatingListeningControls(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    }, { threshold: 0.15 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [doc.id]);

  useEffect(() => {
    if (!selected) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || popoverRef.current?.contains(target)) return;
      setSelected(null);
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [selected]);

  useEffect(() => {
    let selectionTimer = 0;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer as HTMLElement;
      if (!container || !articleRef.current?.contains(container)) return;
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(() => { void selectWord(); }, 180);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.clearTimeout(selectionTimer);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [selectWord]);

  const toggleDifficultSentence = (id: number) => {
    const current = progress.bookmarked_sentence_ids;
    onProgress({
      ...progress,
      bookmarked_sentence_ids: current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
      last_studied_at: new Date().toISOString(),
    });
  };
  const speakSentence = (sentenceIndex: number, text: string) => {
    if (singleSpeakingSentenceIndex === sentenceIndex) {
      if (singleListeningState === "playing") {
        window.speechSynthesis.pause();
        setSingleListeningState("paused");
      } else if (singleListeningState === "paused") {
        window.speechSynthesis.resume();
        setSingleListeningState("playing");
      }
      return;
    }
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
    const run = listeningRun.current;
    setListeningState("idle");
    setSpeakingSentenceIndex(null);
    setChapterListeningKey(null);
    setChapterListeningState("idle");
    setSingleSpeakingSentenceIndex(sentenceIndex);
    setSingleListeningState("playing");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    const finish = () => {
      if (run === listeningRun.current) {
        setSingleSpeakingSentenceIndex(null);
        setSingleListeningState("idle");
      }
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  };
  const openOriginalFile = async () => {
    if (!supabase || !doc.source_file_path) {
      setShowOriginal(true);
      return;
    }
    const preview = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("source-files").createSignedUrl(doc.source_file_path, 600);
    if (error || !data?.signedUrl) {
      preview?.close();
      window.alert("원본 파일을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (preview) {
      preview.opener = null;
      preview.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }
  };
  const downloadOriginalFile = async () => {
    if (!supabase || !doc.source_file_path) return;
    const { data, error } = await supabase.storage.from("source-files").createSignedUrl(
      doc.source_file_path,
      600,
      { download: doc.source_name || "moonwords-original" },
    );
    if (error || !data?.signedUrl) {
      window.alert("원본 파일을 다운로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = doc.source_name || "moonwords-original";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const saveSelected = async () => {
    if (!selected?.meaning) return;
    const sentence = sentences.find((item) => item.id === selected.sentenceId)!;
    await onSaveWord({ document_id: doc.id, sentence_id: sentence.id, word: selected.word, meaning: selected.meaning, source_sentence: sentence.english, translation: sentence.korean, note: "", status: "learning", review_count: 0, correct_count: 0, incorrect_count: 0 });
    setSelected(null); window.getSelection()?.removeAllRanges();
  };
  const confirmDeleteSelected = async () => {
    if (!selected?.savedId) return;
    await onDeleteWord(selected.savedId);
    setSelected(null);
    window.getSelection()?.removeAllRanges();
  };
  const beginTitleEdit = () => {
    setTitleDraft(doc.title);
    setTitleError("");
    setEditingTitle(true);
  };
  const cancelTitleEdit = () => {
    setTitleDraft(doc.title);
    setTitleError("");
    setEditingTitle(false);
  };
  const saveTitle = async () => {
    setTitleSaving(true);
    setTitleError("");
    try {
      await onRenameDocument(doc.id, titleDraft);
      setEditingTitle(false);
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : "본문 제목을 변경하지 못했습니다.");
    } finally {
      setTitleSaving(false);
    }
  };

  return (
    <main className="study-page">
      <section className="reading-head">
        <span className="eyebrow">{doc.analysis.topic}</span>
        {editingTitle ? (
          <form className="reading-title-editor" onSubmit={(event) => { event.preventDefault(); void saveTitle(); }}>
            <input
              autoFocus
              value={titleDraft}
              maxLength={160}
              disabled={titleSaving}
              onChange={(event) => setTitleDraft(event.target.value)}
              aria-label="본문 제목"
            />
            <button type="submit" disabled={titleSaving || !titleDraft.trim()}>{titleSaving ? "저장 중…" : "저장"}</button>
            <button type="button" disabled={titleSaving} onClick={cancelTitleEdit}>취소</button>
          </form>
        ) : (
          <div className="reading-title-row">
            <h1>{doc.title}</h1>
            <button type="button" onClick={beginTitleEdit} aria-label="본문 제목 변경">✎ 제목 변경</button>
          </div>
        )}
        {titleError && <p className="reading-title-error" role="alert">{titleError}</p>}
        <p>{doc.analysis.summary}</p>
        <div className="study-stats">
          <span>{sentences.length} 문장</span><span>{difficultSentences.length} 어려운 문장</span><span>{words.length} 저장 단어</span><span title={describeCefrLevel(doc.analysis.level)}>{formatCefrLevel(doc.analysis.level)}</span>
        </div>
        <div className="reading-head-actions">
          <button className="original-text-toggle" onClick={() => void openOriginalFile()}>▤ 원문 보기</button>
          {doc.source_file_path && <button className="original-download-button" onClick={() => void downloadOriginalFile()}>↓ 다운로드</button>}
          <small>{doc.source_file_path ? "업로드한 원본 파일을 바로 열거나 다운로드할 수 있어요." : "붙여 넣은 원문을 확인할 수 있어요."}</small>
        </div>
      </section>
      <div className="study-layout">
        <article
          className="article-card"
          ref={articleRef}
          onMouseUp={selectWord}
          onTouchEnd={() => window.setTimeout(() => { void selectWord(); }, 120)}
          onScroll={() => setSelected(null)}
        >
          <div className="article-tip"><b>모르는 단어를 드래그해 보세요.</b><span>저장된 단어는 하이라이트를 눌러 뜻 확인·삭제가 가능해요.</span></div>
          <div ref={topListeningRef}>
            <ListeningControls
              state={listeningState}
              currentSentenceIndex={speakingSentenceIndex === null ? 0 : speakingSentenceIndex + 1}
              sentenceCount={sentences.length}
              onPrimary={listeningState === "idle" ? startFullListening : toggleListeningPause}
              onStop={stopListening}
            />
          </div>
          {studySections.map((group, sectionIndex) => <section className="paragraph-block" key={group.key}>
            <header><span>{String(sectionIndex + 1).padStart(2, "0")}</span><div><b>{group.section.label}</b><small>{group.section.role}</small></div><button type="button" className={`chapter-listen-button ${chapterListeningKey === group.key ? "active" : ""}`} aria-pressed={chapterListeningKey === group.key && chapterListeningState !== "idle"} onClick={() => toggleChapterListening(group.key, group.sentences.map((item) => item.sourceIndex))}><PlaybackIcon name={chapterListeningKey === group.key && chapterListeningState === "playing" ? "pause" : "play"} />{chapterListeningKey === group.key && chapterListeningState === "playing" ? "일시정지" : chapterListeningKey === group.key && chapterListeningState === "paused" ? "계속 듣기" : "챕터 듣기"}</button></header>
            {group.sentences.map(({ sentence, displayNumber, sourceIndex }) => {
              const sentenceWords = words.filter((word) => word.sentence_id === sentence.id);
              const sentenceIsPlaying = singleSpeakingSentenceIndex === sourceIndex && singleListeningState === "playing";
              const sentenceIsActive = singleSpeakingSentenceIndex === sourceIndex && singleListeningState !== "idle";
              return <div className={`sentence-pair ${difficultSentences.includes(sentence.id) ? "difficult" : ""} ${speakingSentenceIndex === sourceIndex || sentenceIsActive ? "listening" : ""}`} data-sentence={sentence.id} data-sentence-index={sourceIndex} key={`${sentence.id}-${sourceIndex}`}>
                <div className="sentence-number">{sentence.marked && <span className="source-mark" title="원본 밑줄 표시">★</span>}{displayNumber}</div>
                <div className="sentence-copy"><p className="english"><HighlightedEnglish text={sentence.english} words={sentenceWords} onOpen={openSavedWord} transientWord={lookupHighlight?.sentenceId === sentence.id ? lookupHighlight.word : undefined} transientStatus={lookupHighlight?.sentenceId === sentence.id ? lookupHighlight.status : undefined} onTransientDismiss={() => setLookupHighlight(null)} /></p><p className="korean">{sentence.korean}</p><div className="sentence-actions"><button className={sentenceIsActive ? "sentence-listen-active" : ""} aria-pressed={sentenceIsActive} onClick={() => speakSentence(sourceIndex, sentence.english)}><PlaybackIcon name={sentenceIsPlaying ? "pause" : "play"} />{sentenceIsPlaying ? "일시정지" : sentenceIsActive ? "계속 듣기" : "듣기"}</button><button onClick={() => toggleDifficultSentence(sentence.id)}>{difficultSentences.includes(sentence.id) ? "⚑ 어려운 문장 해제" : "⚐ 어려운 문장 체크"}</button></div></div>
              </div>;
            })}
          </section>)}
        </article>
        <aside className="insight-panel" onScroll={() => setSelected(null)}><span className="section-kicker">READING MAP</span><h3>본문 구조</h3><p>{doc.analysis.structure}</p><div className="structure-list">{studySections.map((group, index) => <div key={group.key}><b>{index + 1}</b><span>{group.section.label}<small>{group.section.role}</small></span></div>)}</div></aside>
      </div>
      {showFloatingListeningControls && singleSpeakingSentenceIndex === null && chapterListeningState === "idle" && <ListeningControls
        state={listeningState}
        currentSentenceIndex={speakingSentenceIndex === null ? 0 : speakingSentenceIndex + 1}
        sentenceCount={sentences.length}
        onPrimary={listeningState === "idle" ? startFullListening : toggleListeningPause}
        onStop={stopListening}
        onSeekBackward={() => seekFullListening(-5)}
        onSeekForward={() => seekFullListening(5)}
        floating
      />}
      {showOriginal && <>
        <button className="original-source-backdrop" aria-label="원문 닫기" onClick={() => setShowOriginal(false)} />
        <aside className="original-source-drawer" role="dialog" aria-modal="true" aria-label="업로드한 원문">
          <header>
            <div><span className="section-kicker">ORIGINAL SOURCE</span><h2>원문 보기</h2><p>{doc.source_name || doc.title}</p></div>
            <div className="original-source-header-actions">{doc.source_file_path && <button className="open-source-file" onClick={() => void openOriginalFile()}>원본 파일 열기 ↗</button>}<button className="close-source-drawer" onClick={() => setShowOriginal(false)} aria-label="원문 닫기">×</button></div>
          </header>
          <div className="original-source-note">학습 화면의 번역·단어장·어려운 문장 체크·퀴즈 기능은 그대로 유지됩니다. 필요할 때 이 원문을 참고하세요.</div>
          <article className="original-source-text">{doc.original_text?.trim() || sentences.map((sentence) => sentence.english).join("\n\n")}</article>
        </aside>
      </>}

      {lookupNotice && <div className="lookup-complete-toast" role="status" aria-live="polite">{lookupNotice}</div>}

      {selected && <div ref={popoverRef} className="selection-popover" style={{ left: selected.x, top: selected.y }}>
        <small>{selected.savedId ? "SAVED WORD" : "MEANING"}</small>
        <strong>{selected.word}</strong>
        <input value={loadingMeaning ? "뜻 찾는 중…" : selected.meaning} disabled={loadingMeaning} onChange={(e) => setSelected({ ...selected, meaning: e.target.value })} placeholder="뜻을 입력하세요" />
        <div><button onClick={() => setSelected(null)}>닫기</button>{selected.savedId && !selected.confirmDelete ? <button className="delete-word" onClick={() => setSelected({ ...selected, confirmDelete: true })}>단어장에서 삭제</button> : !selected.savedId ? <button className="save-word" disabled={!selected.meaning || loadingMeaning} onClick={saveSelected}>단어장에 저장</button> : null}</div>
        {selected.savedId && selected.confirmDelete && <div className="delete-confirm" role="alert"><p>정말 삭제하시겠습니까?</p><div><button onClick={() => setSelected({ ...selected, confirmDelete: false })}>취소</button><button className="confirm-delete" onClick={confirmDeleteSelected}>삭제</button></div></div>}
      </div>}
    </main>
  );
}
