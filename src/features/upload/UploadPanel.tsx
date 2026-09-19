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

  const analyzeWithRetry = async (documentTitle: string, originalText: string) => {
    if (!supabase) throw new Error("Supabase 연결이 필요합니다.");
    let lastMessage = "AI 처리 요청에 실패했습니다.";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await supabase.functions.invoke("process-document", {
        body: { action: "analyze", title: documentTitle, text: originalText },
      });
      if (!response.error) return response.data;
      lastMessage = await getFunctionErrorMessage(response.error);
      const transient = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(lastMessage);
      if (!transient || attempt === 1) throw new Error(lastMessage);
      const delay = (2 ** attempt) * 1_200 + Math.floor(Math.random() * 600);
      setStatus(`Gemini가 혼잡합니다. 잠시 후 자동 재시도합니다 (${attempt + 2}/2)…`);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    throw new Error(lastMessage);
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const client = supabase;
      if (!client) throw new Error("Supabase 연결이 필요합니다.");
      setStatus("본문을 읽는 중…");
      const extracted = inputMode === "file" && file
        ? await extractDocumentFromFile(file, { onProgress: (progress) => setStatus(describeExtractionProgress(progress)) })
        : { text: normalizePastedText(text), markedFragments: [] as string[] };
      const originalText = extracted.text;
      const documentId = uid();
      let sourcePath: string | null = null;

      if (file) {
        setStatus("원본 파일을 내 클라우드에 저장하는 중…");
        const requestedExtension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const safeExtension = requestedExtension.replace(/[^a-z0-9]/g, "") || "bin";
        sourcePath = `${userId}/${documentId}/source.${safeExtension}`;
        const upload = await client.storage.from("source-files").upload(sourcePath, file);
        if (upload.error) throw upload.error;
      }

      setStatus("Gemini가 번역과 학습 문제를 만드는 중…");
      const responseData = await analyzeWithRetry(title || file?.name || "새 영어 본문", originalText);
      const normalizedAnalysis = normalizeNewDocumentAnalysis(responseData.analysis as DocumentAnalysis);
      const analysis = applySourceMarks(normalizedAnalysis, extracted.markedFragments);
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
          throw new Error("폴더 기능 migration을 먼저 적용해 주세요.");
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
      <button className="primary-button wide" disabled={busy || (inputMode === "file" ? !file : text.trim().length < 40)} onClick={create}>{busy ? "학습지 생성 중…" : "AI 학습지 만들기"}</button>
      <p className="privacy-note">Gemini API 키는 서버에서만 사용되며 브라우저나 GitHub에 노출되지 않습니다.</p>
      <a className="pdf-extractor-link" href="./pdf-extractor.html"><span>PDF</span><div><b>텍스트만 먼저 추출하고 싶나요?</b><small>별도 PDF 텍스트 추출기 열기</small></div><i aria-hidden="true">→</i></a>
    </section>
  );
}
