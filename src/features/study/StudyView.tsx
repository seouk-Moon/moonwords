import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { cleanSelection, sameLexeme } from "../../lib/app-utils";
import type { SelectedWord } from "../../app-types";
import type { StudyDocument, StudyProgress, VocabularyItem } from "../../types";
import { HighlightedEnglish } from "./HighlightedEnglish";

export function StudyView({ doc, words, progress, onSaveWord, onDeleteWord, onProgress }: { doc: StudyDocument; words: VocabularyItem[]; progress: StudyProgress; onSaveWord: (word: Omit<VocabularyItem, "id" | "user_id" | "created_at" | "updated_at">) => Promise<void>; onDeleteWord: (id: string) => Promise<void>; onProgress: (next: StudyProgress) => void }) {
  const [selected, setSelected] = useState<SelectedWord | null>(null);
  const [loadingMeaning, setLoadingMeaning] = useState(false);
  const [lookupHighlight, setLookupHighlight] = useState<{ word: string; sentenceId: number; loading: boolean } | null>(null);
  const [listeningState, setListeningState] = useState<"idle" | "playing" | "paused">("idle");
  const [speakingSentenceId, setSpeakingSentenceId] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const meaningCache = useRef(new Map<string, string>());
  const activeLookup = useRef("");
  const listeningRun = useRef(0);
  const playNext = useRef<(index: number, run: number) => void>(() => undefined);
  const sentences = doc.analysis.sentences;
  const understood = progress.understood_sentence_ids;
  const difficultSentences = progress.bookmarked_sentence_ids;

  const selectWord = useCallback(async () => {
    const selection = window.getSelection();
    const word = cleanSelection(selection?.toString() ?? "");
    if (!word || word.length > 60 || !selection?.rangeCount) return;
    const anchor = selection.anchorNode?.parentElement?.closest<HTMLElement>("[data-sentence]");
    if (!anchor) return;
    const sentenceId = Number(anchor.dataset.sentence);
    const sentence = sentences.find((item) => item.id === sentenceId);
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
      setLookupHighlight({ word, sentenceId, loading: true });
      setLoadingMeaning(true);
      try {
        const response = await supabase.functions.invoke("process-document", { body: { action: "define", word, sentence: sentence.english, translation: sentence.korean } });
        if (!response.error && response.data?.meaning) {
          meaningCache.current.set(cacheKey, response.data.meaning);
          setSelected((current) => current && current.sentenceId === sentenceId && current.word === word ? { ...current, meaning: response.data.meaning } : current);
        }
      } finally {
        if (activeLookup.current === cacheKey) {
          setLoadingMeaning(false);
          setLookupHighlight((current) => current && current.sentenceId === sentenceId && current.word === word ? { ...current, loading: false } : current);
          window.setTimeout(() => {
            setLookupHighlight((current) => current && current.sentenceId === sentenceId && current.word === word && !current.loading ? null : current);
          }, 1800);
        }
      }
    }
  }, [sentences, words]);

  const openSavedWord = useCallback((word: VocabularyItem, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    activeLookup.current = "";
    setLoadingMeaning(false);
    setSelected({ word: word.word, sentenceId: word.sentence_id, meaning: word.meaning, savedId: word.id, x: Math.max(12, Math.min(rect.left, window.innerWidth - 322)), y: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 220)) });
    window.getSelection()?.removeAllRanges();
  }, []);

  const stopFullListening = useCallback(() => {
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
    setListeningState("idle");
    setSpeakingSentenceId(null);
  }, []);

  playNext.current = (index, run) => {
    if (run !== listeningRun.current) return;
    if (index >= sentences.length) {
      setListeningState("idle");
      setSpeakingSentenceId(null);
      return;
    }
    const sentence = sentences[index];
    const utterance = new SpeechSynthesisUtterance(sentence.english);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    utterance.onstart = () => {
      if (run !== listeningRun.current) return;
      setSpeakingSentenceId(sentence.id);
      document.querySelector(`[data-sentence="${sentence.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    utterance.onend = () => playNext.current(index + 1, run);
    utterance.onerror = () => {
      if (run === listeningRun.current) stopFullListening();
    };
    window.speechSynthesis.speak(utterance);
  };

  const startFullListening = () => {
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
    const run = listeningRun.current;
    setListeningState("playing");
    setSpeakingSentenceId(null);
    playNext.current(0, run);
  };

  const toggleListeningPause = () => {
    if (listeningState === "playing") {
      window.speechSynthesis.pause();
      setListeningState("paused");
    } else if (listeningState === "paused") {
      window.speechSynthesis.resume();
      setListeningState("playing");
    }
  };

  useEffect(() => {
    setShowOriginal(false);
    return () => {
      listeningRun.current += 1;
      window.speechSynthesis.cancel();
    };
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

  const toggle = (key: "understood_sentence_ids" | "bookmarked_sentence_ids", id: number) => {
    const current = progress[key];
    onProgress({ ...progress, [key]: current.includes(id) ? current.filter((value) => value !== id) : [...current, id], last_studied_at: new Date().toISOString() });
  };
  const speak = (text: string) => { stopFullListening(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "en-US"; utterance.rate = 0.86; window.speechSynthesis.speak(utterance); };
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

  return (
    <main className="study-page">
      <section className="reading-head">
        <span className="eyebrow">{doc.analysis.topic}</span>
        <h1>{doc.title}</h1>
        <p>{doc.analysis.summary}</p>
        <div className="study-stats">
          <span>{sentences.length} 문장</span><span>{understood.length} 이해 완료</span><span>{difficultSentences.length} 어려운 문장</span><span>{words.length} 저장 단어</span><span>{doc.analysis.level}</span>
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
          <div className="audio-toolbar"><div><button className="audio-play" onClick={listeningState === "idle" ? startFullListening : toggleListeningPause}>{listeningState === "idle" ? "▶ 전체 듣기" : listeningState === "paused" ? "▶ 계속 듣기" : "Ⅱ 일시정지"}</button>{listeningState !== "idle" && <button onClick={stopFullListening}>■ 정지</button>}<span>{speakingSentenceId ? `${sentences.findIndex((sentence) => sentence.id === speakingSentenceId) + 1}/${sentences.length} 문장` : "영어 본문 연속 재생"}</span></div></div>
          {doc.analysis.sections.map((section) => <section className="paragraph-block" key={section.id}>
            <header><span>{String(section.id).padStart(2, "0")}</span><div><b>{section.label}</b><small>{section.role}</small></div></header>
            {sentences.filter((sentence) => sentence.paragraph === section.id).map((sentence) => {
              const sentenceWords = words.filter((word) => word.sentence_id === sentence.id);
              return <div className={`sentence-pair ${understood.includes(sentence.id) ? "understood" : ""} ${difficultSentences.includes(sentence.id) ? "difficult" : ""} ${speakingSentenceId === sentence.id ? "listening" : ""}`} data-sentence={sentence.id} key={sentence.id}>
                <div className="sentence-number">{sentence.marked && <span className="source-mark" title="원본 밑줄 표시">★</span>}{sentence.id}</div>
                <div className="sentence-copy"><p className="english"><HighlightedEnglish text={sentence.english} words={sentenceWords} onOpen={openSavedWord} transientWord={lookupHighlight?.sentenceId === sentence.id ? lookupHighlight.word : undefined} transientLoading={lookupHighlight?.sentenceId === sentence.id && lookupHighlight.loading} /></p><p className="korean">{sentence.korean}</p><div className="sentence-actions"><button onClick={() => speak(sentence.english)}>◉ 듣기</button><button onClick={() => toggle("understood_sentence_ids", sentence.id)}>{understood.includes(sentence.id) ? "✓ 이해함" : "○ 이해 체크"}</button><button onClick={() => toggle("bookmarked_sentence_ids", sentence.id)}>{difficultSentences.includes(sentence.id) ? "⚑ 어려운 문장 해제" : "⚐ 어려운 문장 체크"}</button></div></div>
              </div>;
            })}
          </section>)}
        </article>
        <aside className="insight-panel" onScroll={() => setSelected(null)}><span className="section-kicker">READING MAP</span><h3>본문 구조</h3><p>{doc.analysis.structure}</p><div className="structure-list">{doc.analysis.sections.map((section) => <div key={section.id}><b>{section.id}</b><span>{section.label}<small>{section.role}</small></span></div>)}</div><div className="progress-ring"><strong>{Math.round((understood.length / Math.max(sentences.length, 1)) * 100)}%</strong><span>이해 완료</span></div></aside>
      </div>
      {showOriginal && <>
        <button className="original-source-backdrop" aria-label="원문 닫기" onClick={() => setShowOriginal(false)} />
        <aside className="original-source-drawer" role="dialog" aria-modal="true" aria-label="업로드한 원문">
          <header>
            <div><span className="section-kicker">ORIGINAL SOURCE</span><h2>원문 보기</h2><p>{doc.source_name || doc.title}</p></div>
            <div className="original-source-header-actions">{doc.source_file_path && <button className="open-source-file" onClick={() => void openOriginalFile()}>원본 파일 열기 ↗</button>}<button className="close-source-drawer" onClick={() => setShowOriginal(false)} aria-label="원문 닫기">×</button></div>
          </header>
          <div className="original-source-note">학습 화면의 번역·단어장·이해 체크·퀴즈 기능은 그대로 유지됩니다. 필요할 때 이 원문을 참고하세요.</div>
          <article className="original-source-text">{doc.original_text?.trim() || sentences.map((sentence) => sentence.english).join("\n\n")}</article>
        </aside>
      </>}

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
