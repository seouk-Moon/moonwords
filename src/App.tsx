"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { demoDocument } from "./demo";
import { extractTextFromFile, normalizePastedText } from "./lib/file-parsers";
import { cloudConfigured, configureSupabase, supabase } from "./lib/supabase";
import type {
  ReadingQuestion,
  StudyDocument,
  StudyProgress,
  VocabularyItem,
} from "./types";

type View = "library" | "study" | "words" | "quiz" | "upload";
type QuizMode = "meaning" | "cloze" | "comprehension";
type QuizQuestion = {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  wordId?: string;
};
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
const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
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

const splitAudioText = (sentences: string[], maxCharacters = 850) => {
  const chunks: string[] = [];
  let current = "";
  sentences.forEach((sentence) => {
    if (current && current.length + sentence.length + 1 > maxCharacters) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  });
  if (current) chunks.push(current);
  return chunks;
};

const base64ToBytes = (value: string) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const pcmFromAudioBytes = (bytes: Uint8Array, mimeType: string) => {
  if (!mimeType.toLowerCase().includes("wav") || bytes.length < 44) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkName = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkName === "data") return bytes.slice(offset + 8, Math.min(offset + 8 + chunkSize, bytes.length));
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return bytes.slice(44);
};

const createWavBlob = (chunks: Uint8Array[], sampleRate = 24_000, channels = 1) => {
  const pcmLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + pcmLength, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcmLength, true);
  return new Blob([header, ...chunks], { type: "audio/wav" });
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
        <p>파일이나 텍스트를 올리면 Gemini가 문장별 번역, 문맥 단어, 본문 구조와 퀴즈를 만들고 계정에 안전하게 저장합니다.</p>
        <div className="feature-row"><span>PDF · DOCX · TXT</span><span>문맥 단어장</span><span>맞춤 퀴즈</span></div>
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
      <p>영어 원문을 올리면 문장별 자연스러운 번역과 문맥 어휘, 구조 분석, 이해 문제를 자동 생성합니다.</p>
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
  const [exportingAudio, setExportingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [audioError, setAudioError] = useState("");
  const articleRef = useRef<HTMLDivElement>(null);
  const meaningCache = useRef(new Map<string, string>());
  const activeLookup = useRef("");
  const listeningRun = useRef(0);
  const playNext = useRef<(index: number, run: number) => void>(() => undefined);
  const sentences = doc.analysis.sentences;
  const understood = progress.understood_sentence_ids;
  const bookmarks = progress.bookmarked_sentence_ids;

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

  const exportFullAudio = async () => {
    if (!supabase || exportingAudio) return;
    setExportingAudio(true);
    setAudioError("");
    try {
      const chunks = splitAudioText(sentences.map((sentence) => sentence.english));
      const pcmChunks: Uint8Array[] = [];
      let sampleRate = 24_000;
      let channels = 1;
      for (let index = 0; index < chunks.length; index += 1) {
        setAudioStatus(`음원 만드는 중 ${index + 1}/${chunks.length}`);
        let audioData: { audio: string; mimeType?: string; sampleRate?: number; channels?: number } | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const response = await supabase.functions.invoke("process-document", { body: { action: "tts", text: chunks[index] } });
          if (!response.error) {
            audioData = response.data;
            break;
          }
          const message = await getFunctionErrorMessage(response.error);
          const transient = /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(message);
          if (!transient || attempt === 2) throw new Error(message);
          setAudioStatus(`음성 서버 재시도 중 ${index + 1}/${chunks.length}`);
          await new Promise((resolve) => window.setTimeout(resolve, (2 ** attempt) * 1_500));
        }
        if (!audioData?.audio) throw new Error("음성 데이터가 비어 있습니다.");
        sampleRate = Number(audioData.sampleRate || sampleRate);
        channels = Number(audioData.channels || channels);
        pcmChunks.push(pcmFromAudioBytes(base64ToBytes(audioData.audio), audioData.mimeType || "audio/l16"));
      }
      const blob = createWavBlob(pcmChunks, sampleRate, channels);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${doc.title.replace(/[^A-Za-z0-9가-힣 _-]/g, "").trim() || "MoonWords"}_full_audio.wav`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      setAudioStatus("WAV 저장 완료");
    } catch (caught) {
      setAudioError(caught instanceof Error ? caught.message : "음원을 만들지 못했습니다.");
      setAudioStatus("");
    } finally {
      setExportingAudio(false);
    }
  };

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
  const deleteSelected = async () => {
    if (!selected?.savedId) return;
    if (!selected.confirmDelete) {
      setSelected({ ...selected, confirmDelete: true });
      return;
    }
    await onDeleteWord(selected.savedId);
    setSelected(null);
    window.getSelection()?.removeAllRanges();
  };

  return <main className="study-page"><section className="reading-head"><span className="eyebrow">{doc.analysis.topic}</span><h1>{doc.title}</h1><p>{doc.analysis.summary}</p><div className="study-stats"><span>{sentences.length} 문장</span><span>{understood.length} 이해 완료</span><span>{words.length} 저장 단어</span><span>{doc.analysis.level}</span></div></section><nav className="study-nav"><button className="active">본문 학습</button><button onClick={() => onView("words")}>단어장 <b>{words.length}</b></button><button onClick={() => onView("quiz")}>퀴즈</button></nav><div className="study-layout"><article className="article-card" ref={articleRef} onMouseUp={selectWord}><div className="article-tip"><b>모르는 단어를 드래그해 보세요.</b><span>저장된 단어는 하이라이트를 눌러 뜻 확인·삭제가 가능해요.</span></div><div className="audio-toolbar"><div><button className="audio-play" onClick={listeningState === "idle" ? startFullListening : toggleListeningPause}>{listeningState === "idle" ? "▶ 전체 듣기" : listeningState === "paused" ? "▶ 계속 듣기" : "Ⅱ 일시정지"}</button>{listeningState !== "idle" && <button onClick={stopFullListening}>■ 정지</button>}<span>{speakingSentenceId ? `${sentences.findIndex((sentence) => sentence.id === speakingSentenceId) + 1}/${sentences.length} 문장` : "영어 본문 연속 재생"}</span></div><button className="audio-export" disabled={!supabase || exportingAudio} onClick={exportFullAudio}>{exportingAudio ? audioStatus : "↓ 전체 음원 WAV"}</button></div>{audioError && <p className="audio-error">{audioError}</p>}{!audioError && audioStatus && !exportingAudio && <p className="audio-complete">{audioStatus}</p>}{doc.analysis.sections.map((section) => <section className="paragraph-block" key={section.id}><header><span>{String(section.id).padStart(2, "0")}</span><div><b>{section.label}</b><small>{section.role}</small></div></header>{sentences.filter((sentence) => sentence.paragraph === section.id).map((sentence) => { const sentenceWords = words.filter((word) => word.sentence_id === sentence.id); return <div className={`sentence-pair ${understood.includes(sentence.id) ? "understood" : ""} ${speakingSentenceId === sentence.id ? "listening" : ""}`} data-sentence={sentence.id} key={sentence.id}><div className="sentence-number">{sentence.id}</div><div className="sentence-copy"><p className="english"><HighlightedEnglish text={sentence.english} words={sentenceWords} onOpen={openSavedWord} /></p><p className="korean">{sentence.korean}</p><div className="sentence-actions"><button onClick={() => speak(sentence.english)}>◉ 듣기</button><button onClick={() => toggle("understood_sentence_ids", sentence.id)}>{understood.includes(sentence.id) ? "✓ 이해함" : "○ 이해 체크"}</button><button onClick={() => toggle("bookmarked_sentence_ids", sentence.id)}>{bookmarks.includes(sentence.id) ? "★ 저장됨" : "☆ 문장 저장"}</button></div></div></div>; })}</section>)}</article><aside className="insight-panel"><span className="section-kicker">READING MAP</span><h3>본문 구조</h3><p>{doc.analysis.structure}</p><div className="structure-list">{doc.analysis.sections.map((section) => <div key={section.id}><b>{section.id}</b><span>{section.label}<small>{section.role}</small></span></div>)}</div><div className="progress-ring"><strong>{Math.round((understood.length / Math.max(sentences.length, 1)) * 100)}%</strong><span>이해 완료</span></div></aside></div>{selected && <div className="selection-popover" style={{ left: selected.x, top: selected.y }}><small>{selected.savedId ? "SAVED WORD" : "CONTEXT MEANING"}</small><strong>{selected.word}</strong><input value={loadingMeaning ? "문맥 뜻 찾는 중…" : selected.meaning} disabled={loadingMeaning} onChange={(e) => setSelected({ ...selected, meaning: e.target.value })} placeholder="뜻을 입력하세요" /><div><button onClick={() => setSelected(null)}>닫기</button>{selected.savedId ? <button className={`delete-word ${selected.confirmDelete ? "confirm" : ""}`} onClick={deleteSelected}>{selected.confirmDelete ? "정말 삭제" : "단어장에서 삭제"}</button> : <button className="save-word" disabled={!selected.meaning || loadingMeaning} onClick={saveSelected}>단어장에 저장</button>}</div>{selected.confirmDelete && <p className="delete-warning">한 번 더 누르면 단어장에서 삭제됩니다.</p>}</div>}</main>;
}

function Wordbook({ words, onUpdate, onDelete, onStudy }: { words: VocabularyItem[]; onUpdate: (item: VocabularyItem) => void; onDelete: (id: string) => void; onStudy: () => void }) {
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const filtered = words.filter((item) => `${item.word} ${item.meaning}`.toLowerCase().includes(query.toLowerCase()));
  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(words.map((item) => ({ 단어: item.word, 문맥뜻: item.meaning, 영어문장: item.source_sentence, 번역: item.translation, 메모: item.note, 상태: item.status === "mastered" ? "완료" : "학습중", 정답: item.correct_count, 오답: item.incorrect_count })));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "단어장"); XLSX.writeFile(book, `MoonWords_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  return <main className="tool-page"><div className="tool-heading"><div><span className="eyebrow">MY CONTEXT VOCABULARY</span><h1>문맥 단어장</h1><p>드래그해 저장한 뜻과 원문을 함께 복습하세요.</p></div><button className="outline-button" onClick={exportExcel} disabled={!words.length}>↓ Excel 내보내기</button></div><div className="filter-bar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="단어 또는 뜻 검색" /><span>{filtered.length} WORDS</span></div><div className="word-list">{filtered.map((word) => <article className="word-card" key={word.id}><div className="word-main"><span className={`status-dot ${word.status}`} /><div><input className="word-title" value={word.word} onChange={(e) => onUpdate({ ...word, word: e.target.value })} /><input className="word-meaning" value={word.meaning} onChange={(e) => onUpdate({ ...word, meaning: e.target.value })} /></div></div><blockquote>{word.source_sentence}<small>{word.translation}</small></blockquote><textarea value={word.note} onChange={(e) => onUpdate({ ...word, note: e.target.value })} placeholder="암기 팁이나 예문 메모" /><footer><button onClick={() => onUpdate({ ...word, status: word.status === "learning" ? "mastered" : "learning" })}>{word.status === "mastered" ? "✓ 암기 완료" : "학습 중"}</button><span>정답 {word.correct_count} · 오답 {word.incorrect_count}</span><button className={`danger ${confirmDeleteId === word.id ? "confirm" : ""}`} onClick={() => { if (confirmDeleteId === word.id) { onDelete(word.id); setConfirmDeleteId(null); } else setConfirmDeleteId(word.id); }}>{confirmDeleteId === word.id ? "정말 삭제" : "삭제"}</button></footer></article>)}</div>{!filtered.length && <div className="empty-state"><b>{words.length ? "검색 결과가 없어요." : "아직 저장한 단어가 없어요."}</b><p>본문에서 모르는 단어를 드래그하면 여기에 쌓입니다.</p><button className="primary-button" onClick={onStudy}>본문으로 가기</button></div>}</main>;
}

function Quiz({ doc, words, onResult }: { doc: StudyDocument; words: VocabularyItem[]; onResult: (id: string | undefined, correct: boolean) => void }) {
  const [mode, setMode] = useState<QuizMode>("comprehension");
  const [index, setIndex] = useState(0); const [picked, setPicked] = useState<number | null>(null); const [score, setScore] = useState(0); const [done, setDone] = useState(false);
  const questions = useMemo<QuizQuestion[]>(() => {
    if (mode === "comprehension") return doc.analysis.questions.map((q: ReadingQuestion) => ({ prompt: q.question, options: q.options, answer: q.answer, explanation: q.explanation }));
    if (!words.length) return [];
    if (mode === "meaning") return shuffle(words).slice(0, 10).map((word) => { const alternatives = shuffle(words.filter((item) => item.id !== word.id).map((item) => item.meaning)).slice(0, 3); const options = shuffle([word.meaning, ...alternatives]); return { prompt: `“${word.word}”의 문맥상 뜻은?`, options, answer: options.indexOf(word.meaning), explanation: word.source_sentence, wordId: word.id }; });
    return shuffle(words).slice(0, 10).map((word) => { const blank = word.source_sentence.replace(new RegExp(`\\b${word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "______"); const alternatives = shuffle(words.filter((item) => item.id !== word.id).map((item) => item.word)).slice(0, 3); const options = shuffle([word.word, ...alternatives]); return { prompt: blank, options, answer: options.indexOf(word.word), explanation: `${word.word} — ${word.meaning}`, wordId: word.id }; });
  }, [mode, words, doc]);
  const reset = (nextMode = mode) => { setMode(nextMode); setIndex(0); setPicked(null); setScore(0); setDone(false); };
  const answer = (choice: number) => { if (picked !== null) return; setPicked(choice); const correct = choice === questions[index].answer; if (correct) setScore((value) => value + 1); onResult(questions[index].wordId, correct); };
  const next = () => { if (index + 1 >= questions.length) setDone(true); else { setIndex((value) => value + 1); setPicked(null); } };
  return <main className="tool-page quiz-page"><div className="tool-heading"><div><span className="eyebrow">ACTIVE RECALL</span><h1>학습 퀴즈</h1><p>본문 이해와 저장한 단어를 문제로 확인하세요.</p></div></div><div className="quiz-modes"><button className={mode === "comprehension" ? "active" : ""} onClick={() => reset("comprehension")}>본문 이해</button><button className={mode === "meaning" ? "active" : ""} onClick={() => reset("meaning")}>단어 뜻</button><button className={mode === "cloze" ? "active" : ""} onClick={() => reset("cloze")}>빈칸 완성</button></div>{!questions.length ? <div className="empty-state"><b>단어 퀴즈를 만들 단어가 부족해요.</b><p>본문에서 단어를 4개 이상 저장해 보세요.</p></div> : done ? <div className="result-card"><span>RESULT</span><strong>{score} / {questions.length}</strong><p>{score === questions.length ? "완벽해요!" : "틀린 문제를 단어장에서 다시 확인해 보세요."}</p><button className="primary-button" onClick={() => reset()}>다시 풀기</button></div> : <section className="quiz-card"><header><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><b>{score} correct</b></header><h2>{questions[index].prompt}</h2><div className="options">{questions[index].options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} className={picked === null ? "" : optionIndex === questions[index].answer ? "correct" : optionIndex === picked ? "wrong" : "muted"} onClick={() => answer(optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{picked !== null && <div className="answer-note"><b>{picked === questions[index].answer ? "정답입니다" : "정답을 확인하세요"}</b><p>{questions[index].explanation}</p><button onClick={next}>{index + 1 === questions.length ? "결과 보기" : "다음 문제 →"}</button></div>}</section>}</main>;
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
  return <div className="app-shell"><header className="topbar"><button className="brand-button" onClick={() => setView("library")}><Logo /></button><nav><button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>내 본문</button><button className={view === "study" ? "active" : ""} disabled={!current} onClick={() => setView("study")}>본문 학습</button><button className={view === "words" ? "active" : ""} disabled={!current} onClick={() => setView("words")}>단어장</button><button className={view === "quiz" ? "active" : ""} disabled={!current} onClick={() => setView("quiz")}>퀴즈</button></nav><div className="account-area">{!configured && <span className="demo-badge">DEMO</span>}<span>{session?.user.email ?? "샘플 학습"}</span>{session && <button onClick={() => supabase?.auth.signOut()}>로그아웃</button>}</div></header>{view === "library" && <Library documents={documents} onOpen={openDocument} onUpload={() => setView("upload")} />}{view === "upload" && session && <UploadPanel userId={session.user.id} onCreated={(doc) => { setDocuments((items) => [doc, ...items]); void openDocument(doc); }} onCancel={() => setView("library")} />}{current && view === "study" && <StudyView doc={current} words={words} progress={progress} onSaveWord={saveWord} onDeleteWord={deleteWord} onProgress={saveProgress} onView={setView} />}{current && view === "words" && <Wordbook words={words} onUpdate={updateWord} onDelete={deleteWord} onStudy={() => setView("study")} />}{current && view === "quiz" && <Quiz doc={current} words={words} onResult={quizResult} />}</div>;
}
