"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { demoDocument } from "./demo";
import { extractTextFromFile, normalizePastedText } from "./lib/file-parsers";
import { buildOrderingExercise } from "./lib/ordering-quiz";
import { cloudConfigured, configureSupabase, supabase } from "./lib/supabase";
import type {
  ReadingQuestion,
  StudyDocument,
  StudyProgress,
  VocabularyItem,
} from "./types";

type View = "library" | "study" | "words" | "quiz" | "upload";
type QuizMode = "meaning" | "cloze" | "comprehension" | "ordering" | "flashcard";
type OrderingScope = "all" | "difficult" | "selected";
type ComprehensionScope = "all" | "incorrect";
type VocabDirection = "english-korean" | "korean-english";
type VocabFormat = "choice" | "written";
type ChoiceQuizQuestion = {
  kind: "choice";
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  wordId?: string;
  sourceQuestionId?: number;
};
type WrittenQuizQuestion = {
  kind: "written";
  prompt: string;
  answerText: string;
  explanation: string;
  wordId: string;
};
type FlashcardQuestion = {
  kind: "flashcard";
  front: string;
  back: string;
  example: string;
  translation: string;
  wordId: string;
};
type OrderingQuizQuestion = {
  kind: "ordering";
  prompt: string;
  explanation: string;
  sentenceId: number;
  answerTokens: string[];
  shuffledTokens: Array<{ id: string; text: string }>;
  shortened: boolean;
};
type QuizQuestion = ChoiceQuizQuestion | WrittenQuizQuestion | FlashcardQuestion | OrderingQuizQuestion;
type SelectedWord = {
  word: string;
  sentenceId: number;
  meaning: string;
  x: number;
  y: number;
  savedId?: string;
  confirmDelete?: boolean;
};

const uid = () => crypto.randomUUID();
const shuffle = <T,>(items: T[]) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled.every((item, index) => item === items[index])) shuffled.push(shuffled.shift()!);
  return shuffled;
};
const cleanSelection = (value: string) =>
  value.replace(/[“”‘’]/g, "'").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").replace(/\s+/g, " ").trim();
const lexicalForms = (value: string) => {
  const normalized = cleanSelection(value).toLowerCase().replace(/'s$/, "");
  const forms = new Set([normalized]);
  if (!normalized.includes(" ")) {
    if (normalized.endsWith("ies") && normalized.length > 4) forms.add(`${normalized.slice(0, -3)}y`);
    if (normalized.endsWith("ing") && normalized.length > 5) {
      const stem = normalized.slice(0, -3);
      forms.add(stem); forms.add(`${stem}e`);
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
    }
    if (normalized.endsWith("ed") && normalized.length > 4) {
      const stem = normalized.slice(0, -2);
      forms.add(stem); forms.add(`${stem}e`);
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
    }
    if (normalized.endsWith("es") && normalized.length > 4) forms.add(normalized.slice(0, -2));
    if (normalized.endsWith("s") && normalized.length > 3) forms.add(normalized.slice(0, -1));
  }
  return forms;
};
const sameLexeme = (left: string, right: string) => {
  const rightForms = lexicalForms(right);
  return [...lexicalForms(left)].some((form) => rightForms.has(form));
};
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function HighlightedEnglish({ text, words, onOpen }: { text: string; words: VocabularyItem[]; onOpen: (word: VocabularyItem, element: HTMLButtonElement) => void }) {
  if (!words.length) return <>{text}</>;
  const matches = words.flatMap((word) => {
    const pattern = escapeRegExp(word.word.trim());
    if (!pattern) return [];
    const expression = new RegExp(pattern, "gi");
    return [...text.matchAll(expression)].filter((match) => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      return !/[A-Za-z']/.test(text[start - 1] ?? "") && !/[A-Za-z']/.test(text[end] ?? "");
    }).map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, word }));
  }).sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start));
  const accepted = matches.filter((match, index) => !matches.slice(0, index).some((other) => other.start <= match.start && other.end > match.start));
  if (!accepted.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  accepted.forEach((match) => {
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    parts.push(<button type="button" className="saved-word-highlight" key={`${match.word.id}-${match.start}`} title={`${match.word.word}: ${match.word.meaning}`} onMouseUp={(event) => event.stopPropagation()} onClick={(event) => onOpen(match.word, event.currentTarget)}>{text.slice(match.start, match.end)}</button>);
    cursor = match.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

const getFunctionErrorMessage = async (error: unknown) => {
  const fallback = error instanceof Error ? error.message : "AI 처리 요청에 실패했습니다.";
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.clone !== "function") return fallback;
  try {
    const body = await context.clone().json() as { error?: string; message?: string };
    return body.error || body.message || fallback;
  } catch {
    try {
      return (await context.clone().text()) || fallback;
    } catch {
      return fallback;
    }
  }
};

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup") setMessage("인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
  };

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Logo />
        <p className="eyebrow">YOUR READING, YOUR WORDS</p>
        <h1>어떤 영어 본문도<br />나만의 학습지로.</h1>
        <p>파일이나 텍스트를 올리면 Gemini가 문장별 번역, 단어 뜻, 본문 구조와 퀴즈를 만들고 계정에 안전하게 저장합니다.</p>
        <div className="feature-row"><span>PDF · DOCX · TXT</span><span>나만의 단어장</span><span>맞춤 퀴즈</span></div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <span className="section-kicker">{mode === "login" ? "WELCOME BACK" : "START LEARNING"}</span>
        <h2>{mode === "login" ? "내 학습실 열기" : "계정 만들기"}</h2>
        <label>이메일<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" /></label>
        <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="6자 이상" /></label>
        {message && <p className="form-message">{message}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}</button>
        <button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? "처음인가요? 계정 만들기" : "이미 계정이 있나요? 로그인"}
        </button>
      </form>
    </main>
  );
}

function Logo() {
  return <div className="logo"><span className="logo-mark">M</span><span><strong>MoonWords</strong><small>AI ENGLISH STUDIO</small></span></div>;
}

function UploadPanel({ userId, onCreated, onCancel }: { userId: string; onCreated: (doc: StudyDocument) => void; onCancel: () => void }) {
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const analyzeWithRetry = async (documentTitle: string, originalText: string) => {
    if (!supabase) throw new Error("Supabase 연결이 필요합니다.");
    let lastMessage = "AI 처리 요청에 실패했습니다.";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await supabase.functions.invoke("process-document", {
        body: { action: "analyze", title: documentTitle, text: originalText },
      });
      if (!response.error) return response.data;
      lastMessage = await getFunctionErrorMessage(response.error);
      const transient = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(lastMessage);
      if (!transient || attempt === 3) throw new Error(lastMessage);
      const delay = (2 ** attempt) * 1_200 + Math.floor(Math.random() * 600);
      setStatus(`Gemini가 혼잡합니다. 잠시 후 자동 재시도합니다 (${attempt + 2}/4)…`);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    throw new Error(lastMessage);
  };

  const create = async () => {
    setBusy(true); setError("");
    try {
      setStatus("본문을 읽는 중…");
      const originalText = inputMode === "file" && file ? await extractTextFromFile(file) : normalizePastedText(text);
      const documentId = uid();
      let sourcePath: string | null = null;
      if (file && supabase) {
        setStatus("원본 파일을 내 클라우드에 저장하는 중…");
        const requestedExtension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const safeExtension = requestedExtension.replace(/[^a-z0-9]/g, "") || "bin";
        sourcePath = `${userId}/${documentId}/source.${safeExtension}`;
        const upload = await supabase.storage.from("source-files").upload(sourcePath, file);
        if (upload.error) throw upload.error;
      }
      setStatus("Gemini가 번역과 학습 문제를 만드는 중…");
      const responseData = await analyzeWithRetry(title || file?.name || "새 영어 본문", originalText);
      const payload = {
        id: documentId, user_id: userId, title: title.trim() || file?.name.replace(/\.[^.]+$/, "") || "새 영어 본문",
        source_name: file?.name ?? null, source_type: file?.name.split(".").pop()?.toLowerCase() ?? "text",
        source_file_path: sourcePath, original_text: originalText, analysis: responseData.analysis,
      };
      const inserted = await supabase.from("documents").insert(payload).select().single();
      if (inserted.error) throw inserted.error;
      onCreated(inserted.data as StudyDocument);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "본문을 처리하지 못했습니다.");
    } finally { setBusy(false); setStatus(""); }
  };

  return (
    <section className="upload-card">
      <button className="back-button" onClick={onCancel}>← 내 본문</button>
      <span className="section-kicker">NEW READING</span>
      <h1>새 본문을 학습지로 만들기</h1>
      <p>영어 원문을 올리면 문장별 자연스러운 번역과 단어 뜻, 구조 분석, 이해 문제를 자동 생성합니다.</p>
      <div className="segmented"><button className={inputMode === "file" ? "active" : ""} onClick={() => setInputMode("file")}>파일 올리기</button><button className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")}>텍스트 붙여넣기</button></div>
      <label className="field">제목 (선택)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: The Future of Space Travel" /></label>
      {inputMode === "file" ? (
        <label className="dropzone"><input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><strong>{file ? file.name : "PDF, DOCX, TXT, MD 파일 선택"}</strong><span>최대 본문 120,000자 · 스캔 PDF는 텍스트 붙여넣기 권장</span></label>
      ) : <label className="field">영어 본문<textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="영어 본문을 여기에 붙여 넣으세요…" /></label>}
      {status && <p className="processing"><i />{status}</p>}{error && <p className="error-message">{error}</p>}
      <button className="primary-button wide" disabled={busy || (inputMode === "file" ? !file : text.trim().length < 40)} onClick={create}>{busy ? "학습지 생성 중…" : "AI 학습지 만들기"}</button>
      <p className="privacy-note">Gemini API 키는 서버에서만 사용되며 브라우저나 GitHub에 노출되지 않습니다.</p>
    </section>
  );
}

function Library({ documents, onOpen, onUpload }: { documents: StudyDocument[]; onOpen: (doc: StudyDocument) => void; onUpload: () => void }) {
  return <main className="library-page"><section className="library-hero"><div><span className="eyebrow">MY READING LIBRARY</span><h1>읽을수록 쌓이는<br />나만의 영어 서재</h1><p>새 본문을 가져오거나, 지난 학습을 이어서 시작하세요.</p></div><button className="new-document" onClick={onUpload}><b>＋</b><span>새 본문<br /><small>파일 또는 텍스트</small></span></button></section><section className="document-section"><div className="section-heading"><div><span className="section-kicker">SAVED READINGS</span><h2>내 본문 <em>{documents.length}</em></h2></div></div><div className="document-grid">{documents.map((doc, index) => <button className="document-card" key={doc.id} onClick={() => onOpen(doc)}><span className="doc-index">{String(index + 1).padStart(2, "0")}</span><span className="doc-topic">{doc.analysis.topic || "English Reading"}</span><h3>{doc.title}</h3><p>{doc.analysis.summary}</p><footer><span>{doc.analysis.sentences.length} 문장</span><span>{new Date(doc.created_at).toLocaleDateString("ko-KR")}</span></footer></button>)}</div>{documents.length === 0 && <div className="empty-state"><b>아직 저장된 본문이 없어요.</b><p>첫 파일을 올려 AI 학습지를 만들어 보세요.</p><button className="primary-button" onClick={onUpload}>첫 본문 추가</button></div>}</section></main>;
}

function StudyView({ doc, words, progress, onSaveWord, onDeleteWord, onProgress, onView }: { doc: StudyDocument; words: VocabularyItem[]; progress: StudyProgress; onSaveWord: (word: Omit<VocabularyItem, "id" | "user_id" | "created_at" | "updated_at">) => Promise<void>; onDeleteWord: (id: string) => Promise<void>; onProgress: (next: StudyProgress) => void; onView: (view: View) => void }) {
  const [selected, setSelected] = useState<SelectedWord | null>(null);
  const [loadingMeaning, setLoadingMeaning] = useState(false);
  const [listeningState, setListeningState] = useState<"idle" | "playing" | "paused">("idle");
  const [speakingSentenceId, setSpeakingSentenceId] = useState<number | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);
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
    setSelected({ word, sentenceId, meaning: immediateMeaning, savedId: saved?.id, x: Math.max(12, Math.min(rect.left, window.innerWidth - 322)), y: rect.bottom + window.scrollY + 10 });
    if (!immediateMeaning && supabase) {
      activeLookup.current = cacheKey;
      setLoadingMeaning(true);
      try {
        const response = await supabase.functions.invoke("process-document", { body: { action: "define", word, sentence: sentence.english, translation: sentence.korean } });
        if (!response.error && response.data?.meaning) {
          meaningCache.current.set(cacheKey, response.data.meaning);
          setSelected((current) => current && current.sentenceId === sentenceId && current.word === word ? { ...current, meaning: response.data.meaning } : current);
        }
      } finally {
        if (activeLookup.current === cacheKey) setLoadingMeaning(false);
      }
    }
  }, [sentences, words]);

  const openSavedWord = useCallback((word: VocabularyItem, element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    activeLookup.current = "";
    setLoadingMeaning(false);
    setSelected({ word: word.word, sentenceId: word.sentence_id, meaning: word.meaning, savedId: word.id, x: Math.max(12, Math.min(rect.left, window.innerWidth - 322)), y: rect.bottom + window.scrollY + 10 });
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

  useEffect(() => () => {
    listeningRun.current += 1;
    window.speechSynthesis.cancel();
  }, [doc.id]);

  const toggle = (key: "understood_sentence_ids" | "bookmarked_sentence_ids", id: number) => {
    const current = progress[key];
    onProgress({ ...progress, [key]: current.includes(id) ? current.filter((value) => value !== id) : [...current, id], last_studied_at: new Date().toISOString() });
  };
  const speak = (text: string) => { stopFullListening(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "en-US"; utterance.rate = 0.86; window.speechSynthesis.speak(utterance); };
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
          <span>{sentences.length} 문장</span><span>{understood.length} 이해 완료</span><span>{difficultSentences.length} 어려움</span><span>{words.length} 저장 단어</span><span>{doc.analysis.level}</span>
        </div>
      </section>
      <nav className="study-nav"><button className="active">본문 학습</button><button onClick={() => onView("words")}>단어장 <b>{words.length}</b></button><button onClick={() => onView("quiz")}>퀴즈</button></nav>
      <div className="study-layout">
        <article className="article-card" ref={articleRef} onMouseUp={selectWord}>
          <div className="article-tip"><b>모르는 단어를 드래그해 보세요.</b><span>저장된 단어는 하이라이트를 눌러 뜻 확인·삭제가 가능해요.</span></div>
          <div className="audio-toolbar"><div><button className="audio-play" onClick={listeningState === "idle" ? startFullListening : toggleListeningPause}>{listeningState === "idle" ? "▶ 전체 듣기" : listeningState === "paused" ? "▶ 계속 듣기" : "Ⅱ 일시정지"}</button>{listeningState !== "idle" && <button onClick={stopFullListening}>■ 정지</button>}<span>{speakingSentenceId ? `${sentences.findIndex((sentence) => sentence.id === speakingSentenceId) + 1}/${sentences.length} 문장` : "영어 본문 연속 재생"}</span></div></div>
          {doc.analysis.sections.map((section) => <section className="paragraph-block" key={section.id}>
            <header><span>{String(section.id).padStart(2, "0")}</span><div><b>{section.label}</b><small>{section.role}</small></div></header>
            {sentences.filter((sentence) => sentence.paragraph === section.id).map((sentence) => {
              const sentenceWords = words.filter((word) => word.sentence_id === sentence.id);
              return <div className={`sentence-pair ${understood.includes(sentence.id) ? "understood" : ""} ${difficultSentences.includes(sentence.id) ? "difficult" : ""} ${speakingSentenceId === sentence.id ? "listening" : ""}`} data-sentence={sentence.id} key={sentence.id}>
                <div className="sentence-number">{sentence.id}</div>
                <div className="sentence-copy"><p className="english"><HighlightedEnglish text={sentence.english} words={sentenceWords} onOpen={openSavedWord} /></p><p className="korean">{sentence.korean}</p><div className="sentence-actions"><button onClick={() => speak(sentence.english)}>◉ 듣기</button><button onClick={() => toggle("understood_sentence_ids", sentence.id)}>{understood.includes(sentence.id) ? "✓ 이해함" : "○ 이해 체크"}</button><button onClick={() => toggle("bookmarked_sentence_ids", sentence.id)}>{difficultSentences.includes(sentence.id) ? "⚑ 어려움 해제" : "⚐ 어려움 체크"}</button></div></div>
              </div>;
            })}
          </section>)}
        </article>
        <aside className="insight-panel"><span className="section-kicker">READING MAP</span><h3>본문 구조</h3><p>{doc.analysis.structure}</p><div className="structure-list">{doc.analysis.sections.map((section) => <div key={section.id}><b>{section.id}</b><span>{section.label}<small>{section.role}</small></span></div>)}</div><div className="progress-ring"><strong>{Math.round((understood.length / Math.max(sentences.length, 1)) * 100)}%</strong><span>이해 완료</span></div></aside>
      </div>
      {selected && <div className="selection-popover" style={{ left: selected.x, top: selected.y }}>
        <small>{selected.savedId ? "SAVED WORD" : "MEANING"}</small>
        <strong>{selected.word}</strong>
        <input value={loadingMeaning ? "뜻 찾는 중…" : selected.meaning} disabled={loadingMeaning} onChange={(e) => setSelected({ ...selected, meaning: e.target.value })} placeholder="뜻을 입력하세요" />
        <div><button onClick={() => setSelected(null)}>닫기</button>{selected.savedId && !selected.confirmDelete ? <button className="delete-word" onClick={() => setSelected({ ...selected, confirmDelete: true })}>단어장에서 삭제</button> : !selected.savedId ? <button className="save-word" disabled={!selected.meaning || loadingMeaning} onClick={saveSelected}>단어장에 저장</button> : null}</div>
        {selected.savedId && selected.confirmDelete && <div className="delete-confirm" role="alert"><p>정말 삭제하시겠습니까?</p><div><button onClick={() => setSelected({ ...selected, confirmDelete: false })}>취소</button><button className="confirm-delete" onClick={confirmDeleteSelected}>삭제</button></div></div>}
      </div>}
    </main>
  );
}

function Wordbook({ words, onUpdate, onDelete, onStudy }: { words: VocabularyItem[]; onUpdate: (item: VocabularyItem) => void; onDelete: (id: string) => void; onStudy: () => void }) {
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<"full" | "compact">("full");
  const filtered = words.filter((item) => `${item.word} ${item.meaning}`.toLowerCase().includes(query.toLowerCase()));
  const exportExcel = () => {
    const rows = exportMode === "compact"
      ? words.map((item) => ({ 단어: item.word, 뜻: item.meaning }))
      : words.map((item) => ({ 단어: item.word, 뜻: item.meaning, 영어문장: item.source_sentence, 번역: item.translation, 메모: item.note, 상태: item.status === "mastered" ? "완료" : "학습중", 정답: item.correct_count, 오답: item.incorrect_count }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, exportMode === "compact" ? "단어와 뜻" : "전체 단어장");
    XLSX.writeFile(book, `MoonWords_${exportMode === "compact" ? "word_meaning" : "full"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  return <main className="tool-page">
    <div className="tool-heading">
      <div><span className="eyebrow">MY VOCABULARY</span><h1>단어장</h1><p>드래그해 저장한 뜻과 원문을 함께 복습하세요.</p></div>
      <div className="export-controls"><label><span>내보낼 내용</span><select value={exportMode} onChange={(event) => setExportMode(event.target.value as "full" | "compact")}><option value="full">전체 정보</option><option value="compact">단어 + 뜻만</option></select></label><button className="outline-button" onClick={exportExcel} disabled={!words.length}>↓ Excel 내보내기</button></div>
    </div>
    <div className="filter-bar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="단어 또는 뜻 검색" /><span>{filtered.length} WORDS</span></div>
    <div className="word-list">{filtered.map((word) => <article className="word-card" key={word.id}>
      <div className="word-main"><span className={`status-dot ${word.status}`} /><div><input className="word-title" value={word.word} onChange={(e) => onUpdate({ ...word, word: e.target.value })} /><input className="word-meaning" value={word.meaning} onChange={(e) => onUpdate({ ...word, meaning: e.target.value })} /></div></div>
      <blockquote>{word.source_sentence}<small>{word.translation}</small></blockquote>
      <textarea value={word.note} onChange={(e) => onUpdate({ ...word, note: e.target.value })} placeholder="암기 팁이나 예문 메모" />
      <footer><button onClick={() => onUpdate({ ...word, status: word.status === "learning" ? "mastered" : "learning" })}>{word.status === "mastered" ? "✓ 암기 완료" : "학습 중"}</button><span>정답 {word.correct_count} · 오답 {word.incorrect_count}</span>{confirmDeleteId === word.id ? <div className="word-delete-confirm" role="alert"><span>정말 삭제하시겠습니까?</span><button onClick={() => setConfirmDeleteId(null)}>취소</button><button className="danger confirm" onClick={() => { onDelete(word.id); setConfirmDeleteId(null); }}>삭제</button></div> : <button className="danger" onClick={() => setConfirmDeleteId(word.id)}>삭제</button>}</footer>
    </article>)}</div>
    {!filtered.length && <div className="empty-state"><b>{words.length ? "검색 결과가 없어요." : "아직 저장한 단어가 없어요."}</b><p>본문에서 모르는 단어를 드래그하면 여기에 쌓입니다.</p><button className="primary-button" onClick={onStudy}>본문으로 가기</button></div>}
  </main>;
}

const missedComprehensionKey = "__missed_comprehension_question_ids";
const readMissedComprehensionIds = (progress: StudyProgress, questionCount: number) => {
  try {
    const parsed = JSON.parse(progress.sentence_notes?.[missedComprehensionKey] ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id) && id >= 0 && id < questionCount) : [];
  } catch {
    return [];
  }
};

function Quiz({ doc, words, progress, onProgress, onResult }: { doc: StudyDocument; words: VocabularyItem[]; progress: StudyProgress; onProgress: (next: StudyProgress) => void; onResult: (id: string | undefined, correct: boolean) => void }) {
  const [mode, setMode] = useState<QuizMode>("comprehension");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [quizRun, setQuizRun] = useState(0);

  const [comprehensionScope, setComprehensionScope] = useState<ComprehensionScope>("all");
  const [missedComprehensionIds, setMissedComprehensionIds] = useState<number[]>(() => readMissedComprehensionIds(progress, doc.analysis.questions.length));
  const [comprehensionUseAll, setComprehensionUseAll] = useState(true);
  const [comprehensionCount, setComprehensionCount] = useState(Math.max(1, Math.min(5, doc.analysis.questions.length)));
  const [activeComprehensionIds, setActiveComprehensionIds] = useState<number[]>(() => shuffle(doc.analysis.questions.map((_, questionIndex) => questionIndex)));

  const [vocabDirection, setVocabDirection] = useState<VocabDirection>("english-korean");
  const [vocabFormat, setVocabFormat] = useState<VocabFormat>("choice");
  const [vocabUseAll, setVocabUseAll] = useState(false);
  const [vocabCount, setVocabCount] = useState(10);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [writtenRevealed, setWrittenRevealed] = useState(false);
  const [writtenGraded, setWrittenGraded] = useState<boolean | null>(null);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [flashcardGraded, setFlashcardGraded] = useState(false);

  const [orderingScope, setOrderingScope] = useState<OrderingScope>("all");
  const [selectedSentenceIds, setSelectedSentenceIds] = useState<number[]>([]);
  const [shortenLongSentence, setShortenLongSentence] = useState(true);
  const [orderedTokenIds, setOrderedTokenIds] = useState<string[]>([]);
  const [orderingSubmitted, setOrderingSubmitted] = useState(false);
  const [orderingCorrect, setOrderingCorrect] = useState(false);

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
          ...words.filter((word) => word.sentence_id === sentence.id).map((word) => word.word),
        ];
        const exercise = buildOrderingExercise(sentence.english, protectedPhrases, shortenLongSentence);
        if (exercise.answerTokens.length < 2) return [];
        return [{ kind: "ordering", prompt: sentence.korean, explanation: exercise.excerpt, sentenceId: sentence.id, answerTokens: exercise.answerTokens, shuffledTokens: exercise.shuffledTokens, shortened: exercise.shortened }];
      });
    }
    if (!words.length) return [];
    const targetWords = shuffle(words).slice(0, vocabUseAll ? words.length : Math.min(Math.max(vocabCount, 1), words.length));
    if (mode === "flashcard") return targetWords.map((word): FlashcardQuestion => ({
      kind: "flashcard",
      front: vocabDirection === "english-korean" ? word.word : word.meaning,
      back: vocabDirection === "english-korean" ? word.meaning : word.word,
      example: word.source_sentence,
      translation: word.translation,
      wordId: word.id,
    }));
    if (mode === "meaning") return targetWords.map((word): ChoiceQuizQuestion | WrittenQuizQuestion => {
      const prompt = vocabDirection === "english-korean" ? `“${word.word}”의 뜻은?` : `“${word.meaning}”에 해당하는 영어 단어는?`;
      const answerText = vocabDirection === "english-korean" ? word.meaning : word.word;
      if (vocabFormat === "written") return { kind: "written", prompt, answerText, explanation: `${word.source_sentence}\n${word.translation}`, wordId: word.id };
      const candidates = words.filter((item) => item.id !== word.id).map((item) => vocabDirection === "english-korean" ? item.meaning : item.word);
      const alternatives = shuffle([...new Set(candidates.filter((candidate) => candidate !== answerText))]).slice(0, 3);
      const options = shuffle([answerText, ...alternatives]);
      return { kind: "choice", prompt, options, answer: options.indexOf(answerText), explanation: word.source_sentence, wordId: word.id };
    });
    return targetWords.map((word): ChoiceQuizQuestion => {
      const blank = word.source_sentence.replace(new RegExp(`\\b${word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "______");
      const alternatives = shuffle([...new Set(words.filter((item) => item.id !== word.id).map((item) => item.word))]).slice(0, 3);
      const options = shuffle([word.word, ...alternatives]);
      return { kind: "choice", prompt: blank, options, answer: options.indexOf(word.word), explanation: `${word.word} — ${word.meaning}`, wordId: word.id };
    });
  }, [mode, words, doc, orderingScope, selectedSentenceIds, shortenLongSentence, progress.bookmarked_sentence_ids, activeComprehensionIds, vocabDirection, vocabFormat, vocabUseAll, vocabCount, quizRun]);

  const clearAnswer = () => {
    setPicked(null); setOrderedTokenIds([]); setOrderingSubmitted(false); setOrderingCorrect(false);
    setWrittenAnswer(""); setWrittenRevealed(false); setWrittenGraded(null); setFlashcardFlipped(false); setFlashcardGraded(false);
  };
  const clearRun = () => { setIndex(0); setScore(0); setDone(false); clearAnswer(); };
  const prepareComprehension = (scope = comprehensionScope, useAll = comprehensionUseAll, count = comprehensionCount) => {
    const allIds = doc.analysis.questions.map((_, questionIndex) => questionIndex);
    const pool = scope === "incorrect" ? missedComprehensionIds.filter((id) => allIds.includes(id)) : allIds;
    const limit = useAll ? pool.length : Math.min(Math.max(count, 1), pool.length);
    setMode("comprehension"); setActiveComprehensionIds(shuffle(pool).slice(0, limit)); setQuizRun((value) => value + 1); clearRun();
  };
  const reset = (nextMode = mode) => {
    if (nextMode === "comprehension") { prepareComprehension(); return; }
    setMode(nextMode); setQuizRun((value) => value + 1); clearRun();
  };
  const saveMissedComprehensionIds = (questionId: number, correct: boolean) => {
    const next = correct
      ? missedComprehensionIds.filter((id) => id !== questionId)
      : [...new Set([...missedComprehensionIds, questionId])];
    if (next.length === missedComprehensionIds.length && next.every((id, itemIndex) => id === missedComprehensionIds[itemIndex])) return;
    setMissedComprehensionIds(next);
    onProgress({ ...progress, sentence_notes: { ...(progress.sentence_notes ?? {}), [missedComprehensionKey]: JSON.stringify(next) }, last_studied_at: new Date().toISOString() });
  };
  const updateOrderingScope = (scope: OrderingScope) => { setOrderingScope(scope); setQuizRun((value) => value + 1); clearRun(); };
  const updateSentenceSelection = (sentenceId: number) => {
    setSelectedSentenceIds((current) => current.includes(sentenceId) ? current.filter((id) => id !== sentenceId) : [...current, sentenceId]);
    setQuizRun((value) => value + 1); clearRun();
  };
  const answer = (choice: number) => {
    const question = questions[index];
    if (picked !== null || question?.kind !== "choice") return;
    setPicked(choice);
    const correct = choice === question.answer;
    if (correct) setScore((value) => value + 1);
    if (question.sourceQuestionId !== undefined) saveMissedComprehensionIds(question.sourceQuestionId, correct);
    onResult(question.wordId, correct);
  };
  const gradeWritten = (correct: boolean) => {
    const question = questions[index];
    if (question?.kind !== "written" || writtenGraded !== null) return;
    setWrittenGraded(correct); if (correct) setScore((value) => value + 1); onResult(question.wordId, correct);
  };
  const gradeFlashcard = (correct: boolean) => {
    const question = questions[index];
    if (question?.kind !== "flashcard" || flashcardGraded) return;
    setFlashcardGraded(true); if (correct) setScore((value) => value + 1); onResult(question.wordId, correct);
  };
  const submitOrdering = () => {
    const question = questions[index];
    if (question?.kind !== "ordering" || orderingSubmitted || orderedTokenIds.length !== question.answerTokens.length) return;
    const answerTokens = orderedTokenIds.map((id) => question.shuffledTokens.find((token) => token.id === id)?.text ?? "");
    const correct = answerTokens.every((token, tokenIndex) => token === question.answerTokens[tokenIndex]);
    setOrderingCorrect(correct); setOrderingSubmitted(true); if (correct) setScore((value) => value + 1);
  };
  const next = () => {
    if (index + 1 >= questions.length) setDone(true);
    else { setIndex((value) => value + 1); clearAnswer(); }
  };

  const question = questions[index];
  const selectedOrderingTokens = question?.kind === "ordering" ? orderedTokenIds.map((id) => question.shuffledTokens.find((token) => token.id === id)).filter((token): token is { id: string; text: string } => Boolean(token)) : [];
  const availableOrderingTokens = question?.kind === "ordering" ? question.shuffledTokens.filter((token) => !orderedTokenIds.includes(token.id)) : [];
  const availableComprehensionCount = comprehensionScope === "incorrect" ? missedComprehensionIds.length : doc.analysis.questions.length;
  const emptyTitle = mode === "comprehension" && comprehensionScope === "incorrect" ? "현재 저장된 본문 이해 오답이 없어요." : mode === "ordering" ? orderingScope === "difficult" ? "어려움 체크한 문장이 없어요." : "출제할 문장을 선택해 주세요." : "단어 퀴즈를 만들 단어가 없어요.";
  const emptyDescription = mode === "comprehension" ? "전체 문제에서 새로 풀거나, 틀린 문제가 생기면 오답만 다시 풀 수 있어요." : mode === "ordering" ? orderingScope === "difficult" ? "본문 학습에서 문장에 ‘어려움 체크’를 표시해 주세요." : "직접 선택에서 한 문장 이상 골라 주세요." : "본문에서 단어를 저장한 뒤 다시 시작해 주세요.";

  return <main className="tool-page quiz-page">
    <div className="tool-heading"><div><span className="eyebrow">ACTIVE RECALL</span><h1>학습 퀴즈</h1><p>본문 이해, 단어 뜻, 빈칸, 플래시카드와 어순 배열을 연습하세요.</p></div></div>
    <div className="quiz-modes"><button className={mode === "comprehension" ? "active" : ""} onClick={() => prepareComprehension()}>본문 이해</button><button className={mode === "meaning" ? "active" : ""} onClick={() => reset("meaning")}>단어 뜻</button><button className={mode === "flashcard" ? "active" : ""} onClick={() => reset("flashcard")}>플래시카드</button><button className={mode === "cloze" ? "active" : ""} onClick={() => reset("cloze")}>빈칸 완성</button><button className={mode === "ordering" ? "active" : ""} onClick={() => reset("ordering")}>어순 배열</button></div>

    {mode === "comprehension" && <section className="quiz-settings">
      <div className="quiz-setting-row"><strong>출제 범위</strong><div className="scope-buttons"><button className={comprehensionScope === "all" ? "active" : ""} onClick={() => { setComprehensionScope("all"); prepareComprehension("all"); }}>전체 문제</button><button className={comprehensionScope === "incorrect" ? "active" : ""} onClick={() => { setComprehensionScope("incorrect"); prepareComprehension("incorrect"); }}>오답만 <b>{missedComprehensionIds.length}</b></button></div></div>
      <div className="quiz-setting-row"><strong>문제 수</strong><label className="all-count-toggle"><input type="checkbox" checked={comprehensionUseAll} onChange={(event) => { setComprehensionUseAll(event.target.checked); prepareComprehension(comprehensionScope, event.target.checked); }} />전체 출제</label><label className="number-picker"><input type="number" min="1" max={Math.max(1, availableComprehensionCount)} disabled={comprehensionUseAll} value={Math.min(comprehensionCount, Math.max(1, availableComprehensionCount))} onChange={(event) => { const count = Math.max(1, Number(event.target.value)); setComprehensionCount(count); prepareComprehension(comprehensionScope, false, count); }} />개</label><button className="reshuffle-button" onClick={() => prepareComprehension()}>↻ 새로 섞어 출제</button></div>
      <p className="scope-summary">현재 범위 {availableComprehensionCount}문제 · 틀린 문제는 자동으로 오답 목록에 저장됩니다.</p>
    </section>}

    {(mode === "meaning" || mode === "flashcard" || mode === "cloze") && <section className="quiz-settings compact">
      {(mode === "meaning" || mode === "flashcard") && <div className="quiz-setting-row"><strong>학습 방향</strong><div className="scope-buttons"><button className={vocabDirection === "english-korean" ? "active" : ""} onClick={() => { setVocabDirection("english-korean"); reset(mode); }}>영어 → 한글</button><button className={vocabDirection === "korean-english" ? "active" : ""} onClick={() => { setVocabDirection("korean-english"); reset(mode); }}>한글 → 영어</button></div></div>}
      {mode === "meaning" && <div className="quiz-setting-row"><strong>답변 방식</strong><div className="scope-buttons"><button className={vocabFormat === "choice" ? "active" : ""} onClick={() => { setVocabFormat("choice"); reset("meaning"); }}>선택형</button><button className={vocabFormat === "written" ? "active" : ""} onClick={() => { setVocabFormat("written"); reset("meaning"); }}>서술형</button></div></div>}
      <div className="quiz-setting-row"><strong>단어 수</strong><label className="all-count-toggle"><input type="checkbox" checked={vocabUseAll} onChange={(event) => { setVocabUseAll(event.target.checked); reset(mode); }} />전체</label><label className="number-picker"><input type="number" min="1" max={Math.max(1, words.length)} disabled={vocabUseAll} value={Math.min(vocabCount, Math.max(1, words.length))} onChange={(event) => { setVocabCount(Math.max(1, Number(event.target.value))); reset(mode); }} />개</label><button className="reshuffle-button" onClick={() => reset(mode)}>↻ 다시 섞기</button></div>
    </section>}

    {mode === "ordering" && <section className="ordering-setup">
      <div className="ordering-setting"><strong>출제 범위</strong><div className="scope-buttons"><button className={orderingScope === "all" ? "active" : ""} onClick={() => updateOrderingScope("all")}>전체 문장</button><button className={orderingScope === "difficult" ? "active" : ""} onClick={() => updateOrderingScope("difficult")}>어려움 체크</button><button className={orderingScope === "selected" ? "active" : ""} onClick={() => updateOrderingScope("selected")}>직접 선택</button></div><button className="reshuffle-button" onClick={() => reset("ordering")}>↻ 문장·단어 다시 섞기</button></div>
      <label className="excerpt-toggle"><input type="checkbox" checked={shortenLongSentence} onChange={(event) => { setShortenLongSentence(event.target.checked); reset("ordering"); }} /><span><b>긴 문장은 핵심 일부만 출제</b><small>짧은 문장은 전체를 사용하고, 긴 문장은 의미 있는 구간으로 나눕니다.</small></span></label>
      {orderingScope === "difficult" && <p className="scope-summary">어려움 체크한 문장 {progress.bookmarked_sentence_ids.length}개를 매번 섞어서 출제합니다.</p>}
      {orderingScope === "selected" && <div className="sentence-picker"><header><span>원하는 문장을 골라 주세요.</span><div><button onClick={() => { setSelectedSentenceIds(doc.analysis.sentences.map((sentence) => sentence.id)); reset("ordering"); }}>전체 선택</button><button onClick={() => { setSelectedSentenceIds([]); reset("ordering"); }}>선택 해제</button></div></header>{doc.analysis.sentences.map((sentence) => <label key={sentence.id}><input type="checkbox" checked={selectedSentenceIds.includes(sentence.id)} onChange={() => updateSentenceSelection(sentence.id)} /><span><b>{sentence.id}</b>{sentence.english}</span></label>)}</div>}
    </section>}

    {!questions.length ? <div className="empty-state"><b>{emptyTitle}</b><p>{emptyDescription}</p></div> : done ? <div className="result-card"><span>RESULT</span><strong>{score} / {questions.length}</strong><p>{score === questions.length ? "완벽해요!" : mode === "comprehension" ? `현재 본문 이해 오답 ${missedComprehensionIds.length}개가 저장되어 있어요.` : mode === "ordering" ? "다시 풀면 문장과 단어 순서가 새롭게 섞입니다." : mode === "flashcard" ? "헷갈린 카드는 다시 보기로 반복해 보세요." : "틀린 단어를 단어장에서 다시 확인해 보세요."}</p><div className="result-actions">{mode === "comprehension" && missedComprehensionIds.length > 0 && <button onClick={() => { setComprehensionScope("incorrect"); prepareComprehension("incorrect"); }}>오답만 풀기</button>}<button className="primary-button" onClick={() => reset()}>다시 섞어 풀기</button></div></div> : question?.kind === "ordering" ? <section className="quiz-card ordering-card">
      <header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header>
      <div className="ordering-prompt"><span>{question.shortened ? "긴 문장 일부 출제" : "문장 전체 출제"}</span><h2>영어 어순에 맞게 배열하세요.</h2><p>{question.prompt}</p></div>
      <div className={`ordering-answer ${orderingSubmitted ? orderingCorrect ? "correct" : "wrong" : ""}`}>{selectedOrderingTokens.length ? selectedOrderingTokens.map((token) => <button key={token.id} disabled={orderingSubmitted} onClick={() => setOrderedTokenIds((ids) => ids.filter((id) => id !== token.id))}>{token.text}</button>) : <span>아래 단어를 순서대로 선택하세요.</span>}</div>
      <div className="ordering-bank">{availableOrderingTokens.map((token) => <button key={token.id} disabled={orderingSubmitted} onClick={() => setOrderedTokenIds((ids) => [...ids, token.id])}>{token.text}</button>)}</div>
      {!orderingSubmitted ? <div className="ordering-actions"><button onClick={() => setOrderedTokenIds([])} disabled={!orderedTokenIds.length}>초기화</button><button className="primary-button" onClick={submitOrdering} disabled={orderedTokenIds.length !== question.answerTokens.length}>채점하기</button></div> : <div className="answer-note"><b>{orderingCorrect ? "정답입니다" : "정답을 확인하세요"}</b><p>{question.answerTokens.join(" ")}</p><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></div>}
    </section> : question?.kind === "written" ? <section className="quiz-card written-card"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header><h2>{question.prompt}</h2><div className="written-response"><input autoFocus value={writtenAnswer} disabled={writtenRevealed} onChange={(event) => setWrittenAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && writtenAnswer.trim()) setWrittenRevealed(true); }} placeholder="정답을 직접 입력하세요" /><button className="primary-button" disabled={!writtenAnswer.trim() || writtenRevealed} onClick={() => setWrittenRevealed(true)}>정답 확인</button></div>{writtenRevealed && <div className="answer-note written-note"><b>정답: {question.answerText}</b><p>내 답: {writtenAnswer}</p><p className="example-note">{question.explanation}</p>{writtenGraded === null ? <div className="self-grade"><span>내 답을 스스로 채점해 주세요.</span><button onClick={() => gradeWritten(false)}>틀렸어요</button><button className="correct-button" onClick={() => gradeWritten(true)}>맞았어요</button></div> : <><strong>{writtenGraded ? "정답으로 기록했습니다." : "오답으로 기록했습니다."}</strong><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></>}</div>}</section> : question?.kind === "flashcard" ? <section className="quiz-card flashcard-wrap"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} memorized</b></header><button className={`flashcard ${flashcardFlipped ? "flipped" : ""}`} onClick={() => setFlashcardFlipped(true)}><span>{flashcardFlipped ? "BACK" : "FRONT"}</span><strong>{flashcardFlipped ? question.back : question.front}</strong>{flashcardFlipped ? <small>{question.example}<em>{question.translation}</em></small> : <small>카드를 눌러 답을 확인하세요.</small>}</button>{flashcardFlipped && !flashcardGraded && <div className="flashcard-actions"><button onClick={() => gradeFlashcard(false)}>다시 보기</button><button className="primary-button" onClick={() => gradeFlashcard(true)}>외웠어요</button></div>}{flashcardGraded && <div className="answer-note"><b>학습 결과를 기록했습니다.</b><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 카드 →"}</button></div>}</section> : question?.kind === "choice" ? <section className="quiz-card"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header><h2>{question.prompt}</h2><div className="options">{question.options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} className={picked === null ? "" : optionIndex === question.answer ? "correct" : optionIndex === picked ? "wrong" : "muted"} onClick={() => answer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{picked !== null && <div className="answer-note"><b>{picked === question.answer ? "정답입니다" : "정답을 확인하세요"}</b><p>{question.explanation}</p><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></div>}</section> : null}
  </main>;
}

type AppProps = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

export default function App({
  supabaseUrl,
  supabasePublishableKey,
}: AppProps = {}) {
  configureSupabase(supabaseUrl, supabasePublishableKey);
  const configured = cloudConfigured;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [documents, setDocuments] = useState<StudyDocument[]>(configured ? [] : [demoDocument]);
  const [current, setCurrent] = useState<StudyDocument | null>(configured ? null : demoDocument);
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [progress, setProgress] = useState<StudyProgress>({ user_id: "demo-user", document_id: demoDocument.id, understood_sentence_ids: [], bookmarked_sentence_ids: [], sentence_notes: {}, last_studied_at: new Date().toISOString() });
  const [view, setView] = useState<View>(configured ? "library" : "study");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void supabase.from("documents").select("*").order("created_at", { ascending: false }).then((result) => {
      if (!result.error) setDocuments(result.data as StudyDocument[]);
    });
  }, [session]);

  const openDocument = useCallback(async (doc: StudyDocument) => {
    setCurrent(doc); setView("study");
    if (!supabase || !session) return;
    const [wordResult, progressResult] = await Promise.all([
      supabase.from("vocabulary").select("*").eq("document_id", doc.id).order("created_at"),
      supabase.from("study_progress").select("*").eq("document_id", doc.id).maybeSingle(),
    ]);
    setWords((wordResult.data ?? []) as VocabularyItem[]);
    setProgress((progressResult.data as StudyProgress | null) ?? { user_id: session.user.id, document_id: doc.id, understood_sentence_ids: [], bookmarked_sentence_ids: [], sentence_notes: {}, last_studied_at: new Date().toISOString() });
  }, [session]);

  const saveWord = async (payload: Omit<VocabularyItem, "id" | "user_id" | "created_at" | "updated_at">) => {
    if (words.some((item) => item.sentence_id === payload.sentence_id && item.word.toLowerCase() === payload.word.toLowerCase())) return;
    if (!supabase || !session) { const now = new Date().toISOString(); setWords((items) => [...items, { ...payload, id: uid(), user_id: "demo-user", created_at: now, updated_at: now }]); return; }
    const result = await supabase.from("vocabulary").insert({ ...payload, user_id: session.user.id }).select().single();
    if (!result.error) setWords((items) => [...items, result.data as VocabularyItem]);
  };
  const updateWord = async (item: VocabularyItem) => { setWords((items) => items.map((value) => value.id === item.id ? item : value)); if (supabase && session) await supabase.from("vocabulary").update({ word: item.word, meaning: item.meaning, note: item.note, status: item.status, correct_count: item.correct_count, incorrect_count: item.incorrect_count, review_count: item.review_count }).eq("id", item.id); };
  const deleteWord = async (id: string) => { setWords((items) => items.filter((item) => item.id !== id)); if (supabase && session) await supabase.from("vocabulary").delete().eq("id", id); };
  const saveProgress = (next: StudyProgress) => { setProgress(next); if (supabase && session) void supabase.from("study_progress").upsert({ ...next, user_id: session.user.id }, { onConflict: "user_id,document_id" }); };
  const quizResult = (id: string | undefined, correct: boolean) => { if (!id) return; const item = words.find((word) => word.id === id); if (item) void updateWord({ ...item, review_count: item.review_count + 1, correct_count: item.correct_count + (correct ? 1 : 0), incorrect_count: item.incorrect_count + (correct ? 0 : 1) }); };

  if (loading) return <div className="loading-screen"><Logo /><p>내 학습실을 여는 중…</p></div>;
  if (configured && !session) return <AuthScreen />;
  return <div className="app-shell"><header className="topbar"><button className="brand-button" onClick={() => setView("library")}><Logo /></button><nav><button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>내 본문</button><button className={view === "study" ? "active" : ""} disabled={!current} onClick={() => setView("study")}>본문 학습</button><button className={view === "words" ? "active" : ""} disabled={!current} onClick={() => setView("words")}>단어장</button><button className={view === "quiz" ? "active" : ""} disabled={!current} onClick={() => setView("quiz")}>퀴즈</button></nav><div className="account-area">{!configured && <span className="demo-badge">DEMO</span>}<span>{session?.user.email ?? "샘플 학습"}</span>{session && <button onClick={() => supabase?.auth.signOut()}>로그아웃</button>}</div></header>{view === "library" && <Library documents={documents} onOpen={openDocument} onUpload={() => setView("upload")} />}{view === "upload" && session && <UploadPanel userId={session.user.id} onCreated={(doc) => { setDocuments((items) => [doc, ...items]); void openDocument(doc); }} onCancel={() => setView("library")} />}{current && view === "study" && <StudyView doc={current} words={words} progress={progress} onSaveWord={saveWord} onDeleteWord={deleteWord} onProgress={saveProgress} onView={setView} />}{current && view === "words" && <Wordbook words={words} onUpdate={updateWord} onDelete={deleteWord} onStudy={() => setView("study")} />}{current && view === "quiz" && <Quiz doc={current} words={words} progress={progress} onProgress={saveProgress} onResult={quizResult} />}</div>;
}
