import { useState } from "react";
import {
  extractDocumentFromFile,
  normalizePastedText,
  type DocumentExtractionProgress,
} from "../../lib/file-parsers";
import { getFunctionErrorMessage } from "../../lib/function-error";
import { uid } from "../../lib/app-utils";
import { normalizeNewDocumentAnalysis } from "../../lib/analysis-normalization";
import { supabase } from "../../lib/supabase";
import type { DocumentAnalysis, StudyDocument } from "../../types";

const normalizeForMark = (value: string) => value
  .toLowerCase()
  .replace(/[“”‘’"']/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const applySourceMarks = (analysis: DocumentAnalysis, fragments: string[]): DocumentAnalysis => {
  if (!fragments.length) return analysis;
  const normalizedFragments = fragments.map(normalizeForMark).filter((value) => value.length >= 8);
  if (!normalizedFragments.length) return analysis;

  return {
    ...analysis,
    sentences: analysis.sentences.map((sentence) => {
      const sentenceText = normalizeForMark(sentence.english);
      const marked = normalizedFragments.some((fragment) =>
        sentenceText.includes(fragment) || fragment.includes(sentenceText),
      );
      return marked ? { ...sentence, marked: true } : sentence;
    }),
  };
};

type BlankIssue = {
  id: number;
  start: number;
  end: number;
  token: string;
  context: string;
};

type PreparedDocument = {
  text: string;
  markedFragments: string[];
};

const findBlankIssues = (text: string): BlankIssue[] => {
  const matches = [...text.matchAll(/_{3,}|＿{3,}|□{2,}|\.{5,}/g)].slice(0, 30);
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const contextStart = Math.max(0, start - 90);
    const contextEnd = Math.min(text.length, end + 90);
    return {
      id: index,
      start,
      end,
      token: match[0],
      context: `${contextStart > 0 ? "…" : ""}${text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim()}${contextEnd < text.length ? "…" : ""}`,
    };
  });
};

const applyBlankAnswers = (
  text: string,
  issues: BlankIssue[],
  answers: Record<number, { value: string; keepBlank: boolean }>,
) => {
  let next = text;
  [...issues].sort((a, b) => b.start - a.start).forEach((issue) => {
    const answer = answers[issue.id];
    if (!answer || answer.keepBlank || !answer.value.trim()) return;
    next = `${next.slice(0, issue.start)}${answer.value.trim()}${next.slice(issue.end)}`;
  });
  return next;
};

const describeExtractionProgress = (progress: DocumentExtractionProgress) => {
  if (progress.stage === "reading") return `PDF 글자를 확인하는 중 (${progress.currentPage}/${progress.totalPages})…`;
  if (progress.stage === "ocr-loading") return "스캔 PDF를 위한 OCR 엔진을 준비하는 중…";
  if (progress.stage === "ocr-rendering") return `PDF 화질을 보정하는 중 (${progress.currentPage}/${progress.totalPages})…`;
  return `OCR로 ${progress.currentPage}페이지를 읽는 중 (${Math.max(1, Math.round(progress.progress * 100))}%)…`;
};

export function UploadPanel({
  userId,
  folderId = null,
  initialTitle = "",
  initialText = "",
  importedFromPdfTool = false,
  onCreated,
  onCancel,
}: {
  userId: string;
  folderId?: string | null;
  initialTitle?: string;
  initialText?: string;
  importedFromPdfTool?: boolean;
  onCreated: (doc: StudyDocument) => void;
  onCancel: () => void;
}) {
  const [inputMode, setInputMode] = useState<"file" | "text">(initialText ? "text" : "file");
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedDocument | null>(null);
  const [blankIssues, setBlankIssues] = useState<BlankIssue[]>([]);
  const [blankAnswers, setBlankAnswers] = useState<Record<number, { value: string; keepBlank: boolean }>>({});

  const analyzeWithRetry = async (documentTitle: string, originalText: string) => {
    if (!supabase) throw new Error("Supabase 연결이 필요합니다.");
    let lastMessage = "AI 처리 요청에 실패했습니다.";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await supabase.functions.invoke("process-document", {
        body: { action: "analyze", title: documentTitle, text: originalText, questionCount: 10 },
      });
      if (!response.error) return response.data;
      lastMessage = await getFunctionErrorMessage(response.error);
      const transient = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(lastMessage);
      if (!transient || attempt === 1) throw new Error(lastMessage);
      const delay = (2 ** attempt) * 1_200 + Math.floor(Math.random() * 600);
      setStatus(`잠시 혼잡합니다. 자동으로 다시 시도합니다 (${attempt + 2}/2)…`);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    throw new Error(lastMessage);
  };

  const finalizeDocument = async (source: PreparedDocument) => {
    setBusy(true);
    setError("");
    try {
      const client = supabase;
      if (!client) throw new Error("Supabase 연결이 필요합니다.");
      const originalText = source.text;
      const documentId = uid();
      let sourcePath: string | null = null;

      if (file) {
        setStatus("원본 파일을 저장하는 중…");
        const requestedExtension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const safeExtension = requestedExtension.replace(/[^a-z0-9]/g, "") || "bin";
        sourcePath = `${userId}/${documentId}/source.${safeExtension}`;
        const upload = await client.storage.from("source-files").upload(sourcePath, file);
        if (upload.error) throw upload.error;
      }

      setStatus("번역과 학습 문제를 만드는 중…");
      const responseData = await analyzeWithRetry(title || file?.name || "새 영어 본문", originalText);
      const normalizedAnalysis = normalizeNewDocumentAnalysis(responseData.analysis as DocumentAnalysis);
      const analysis = applySourceMarks(normalizedAnalysis, source.markedFragments);
      const payload = {
        id: documentId,
        user_id: userId,
        ...(folderId ? { folder_id: folderId } : {}),
        title: title.trim() || file?.name.replace(/\.[^.]+$/, "") || "새 영어 본문",
        source_name: file?.name ?? null,
        source_type: file?.name.split(".").pop()?.toLowerCase() ?? "text",
        source_file_path: sourcePath,
        original_text: originalText,
        analysis,
      };
      const inserted = await client.from("documents").insert(payload).select().single();
      if (inserted.error) {
        if (folderId && inserted.error.message.includes("folder_id")) {
          throw new Error("선택한 폴더에 저장하지 못했습니다. 폴더를 새로고침한 뒤 다시 시도해 주세요.");
        }
        throw inserted.error;
      }
      onCreated(inserted.data as StudyDocument);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "본문을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus("본문을 읽는 중…");
      const extracted = inputMode === "file" && file
        ? await extractDocumentFromFile(file, { onProgress: (progress) => setStatus(describeExtractionProgress(progress)) })
        : { text: normalizePastedText(text), markedFragments: [] as string[] };
      const source: PreparedDocument = { text: extracted.text, markedFragments: extracted.markedFragments };
      const issues = findBlankIssues(source.text);
      if (issues.length) {
        setPrepared(source);
        setBlankIssues(issues);
        setBlankAnswers(Object.fromEntries(issues.map((issue) => [issue.id, { value: "", keepBlank: false }])));
        setBusy(false);
        setStatus("");
        return;
      }
      await finalizeDocument(source);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "본문을 처리하지 못했습니다.");
      setBusy(false);
      setStatus("");
    }
  };

  const resolveBlanksAndContinue = async () => {
    if (!prepared) return;
    const unresolved = blankIssues.some((issue) => {
      const answer = blankAnswers[issue.id];
      return !answer?.keepBlank && !answer?.value.trim();
    });
    if (unresolved) {
      setError("각 빈칸에 내용을 입력하거나 ‘비워두기’를 선택해 주세요.");
      return;
    }
    setError("");
    const nextText = applyBlankAnswers(prepared.text, blankIssues, blankAnswers);
    setPrepared(null);
    setBlankIssues([]);
    await finalizeDocument({ ...prepared, text: nextText });
  };

  if (prepared && blankIssues.length) {
    return (
      <section className="upload-card blank-review-card">
        <button className="back-button" onClick={() => { setPrepared(null); setBlankIssues([]); setError(""); }}>← 본문 입력으로</button>
        <span className="section-kicker">CHECK BLANKS</span>
        <h1>빈칸을 확인해 주세요</h1>
        <p>본문에서 빈칸처럼 보이는 부분을 찾았습니다. 들어갈 내용을 적거나 그대로 비워둘 수 있어요.</p>
        <div className="blank-review-list">
          {blankIssues.map((issue, index) => {
            const answer = blankAnswers[issue.id] ?? { value: "", keepBlank: false };
            return (
              <article className="blank-review-item" key={`${issue.start}-${issue.id}`}>
                <span>{index + 1}</span>
                <div>
                  <p>{issue.context}</p>
                  <input
                    value={answer.value}
                    disabled={answer.keepBlank}
                    onChange={(event) => setBlankAnswers((current) => ({ ...current, [issue.id]: { value: event.target.value, keepBlank: false } }))}
                    placeholder="이 빈칸에 들어갈 내용"
                  />
                  <button
                    type="button"
                    className={answer.keepBlank ? "active" : ""}
                    onClick={() => setBlankAnswers((current) => ({ ...current, [issue.id]: { value: "", keepBlank: !answer.keepBlank } }))}
                  >
                    {answer.keepBlank ? "✓ 그대로 비워두기" : "그대로 비워두기"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <button className="text-button blank-all-skip" type="button" onClick={() => setBlankAnswers(Object.fromEntries(blankIssues.map((issue) => [issue.id, { value: "", keepBlank: true }])))}>모두 그대로 비워두기</button>
        {error && <p className="error-message">{error}</p>}
        <button className="primary-button wide" disabled={busy} onClick={() => { void resolveBlanksAndContinue(); }}>{busy ? "학습지 생성 중…" : "확인 완료 · 학습지 만들기"}</button>
      </section>
    );
  }

  return (
    <section className="upload-card">
      <button className="back-button" onClick={onCancel}>← 내 본문</button>
      <span className="section-kicker">NEW READING</span>
      <h1>새 본문을 학습지로 만들기</h1>
      <p>영어 원문을 올리면 문장별 자연스러운 번역과 단어 뜻, 구조 분석, 이해 문제를 자동 생성합니다.</p>
      {folderId && <p className="upload-folder-note">📁 현재 선택한 폴더에 저장됩니다.</p>}
      {importedFromPdfTool && (
        <div className="pdf-import-notice">
          <div><b>PDF 텍스트를 가져왔습니다.</b><span>내용을 확인한 뒤 AI 학습지를 만들어 주세요.</span></div>
          <a href="./pdf-extractor.html">추출기 다시 열기</a>
        </div>
      )}
      <div className="segmented"><button className={inputMode === "file" ? "active" : ""} onClick={() => setInputMode("file")}>파일 올리기</button><button className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")}>텍스트 붙여넣기</button></div>
      <label className="field">제목 (선택)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: The Future of Space Travel" /></label>
      {inputMode === "file" ? (
        <label className="dropzone"><input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><strong>{file ? file.name : "PDF, DOCX, TXT, MD 파일 선택"}</strong><span>최대 본문 120,000자 · 흐린 스캔 PDF는 브라우저 OCR로 자동 보완</span></label>
      ) : <label className="field">영어 본문<textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="영어 본문을 여기에 붙여 넣으세요…" /></label>}
      {status && <p className="processing"><i />{status}</p>}{error && <p className="error-message">{error}</p>}
      <button className="primary-button wide" disabled={busy || (inputMode === "file" ? !file : text.trim().length < 40)} onClick={() => { void create(); }}>{busy ? "학습지 생성 중…" : "AI 학습지 만들기"}</button>
      <a className="pdf-extractor-link" href="./pdf-extractor.html"><span>PDF</span><div><b>텍스트만 먼저 추출하고 싶나요?</b><small>별도 PDF 텍스트 추출기 열기</small></div><i aria-hidden="true">→</i></a>
    </section>
  );
}
