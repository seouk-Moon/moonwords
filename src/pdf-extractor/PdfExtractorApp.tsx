import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";
import { Logo } from "../components/brand/Logo";
import {
  extractDocumentFromFile,
  MAX_DOCUMENT_TEXT_LENGTH,
  type DocumentExtractionProgress,
} from "../lib/file-parsers";
import { savePendingPdfTransfer } from "./transfer";

const MAX_PDF_FILE_SIZE = 50 * 1024 * 1024;
const MOONWORDS_HOME_HREF = "./index.html";

const withoutExtension = (fileName: string) => fileName.replace(/\.pdf$/i, "").trim();

const safeDownloadName = (title: string) => {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned || "moonwords-pdf-text"}.txt`;
};

const describeProgress = (progress: DocumentExtractionProgress) => {
  if (progress.stage === "reading") {
    return `PDF 글자 정보를 확인하는 중 (${progress.currentPage}/${progress.totalPages})…`;
  }
  if (progress.stage === "ocr-loading") return "스캔 PDF용 OCR 엔진을 준비하는 중…";
  if (progress.stage === "ocr-rendering") {
    return `화질을 보정해 OCR 이미지를 만드는 중 (${progress.currentPage}/${progress.totalPages})…`;
  }
  const percent = Math.max(1, Math.round(progress.progress * 100));
  return `OCR로 ${progress.currentPage}페이지 글자를 읽는 중 (${percent}%)…`;
};

function PdfDocumentIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M16 6h23l11 11v41H16z" fill="#fff" stroke="currentColor" strokeWidth="2.5" />
      <path d="M39 6v12h11" fill="#dbeafe" stroke="currentColor" strokeWidth="2.5" />
      <path d="M23 31h20M23 39h20M23 47h13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PdfExtractorApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLTextAreaElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [ocrUsed, setOcrUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("PDF를 읽는 중…");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const wordCount = useMemo(() => text.trim() ? text.trim().split(/\s+/).length : 0, [text]);

  const extractPdf = async (selectedFile: File, forceOcr = false) => {
    setError("");
    setNotice("");
    if (!forceOcr) {
      setText("");
      setPageCount(0);
      setOcrUsed(false);
    }

    const isPdf = selectedFile.type === "application/pdf" || /\.pdf$/i.test(selectedFile.name);
    if (!isPdf) {
      setFile(null);
      setError("PDF 파일만 선택할 수 있습니다.");
      return;
    }
    if (selectedFile.size > MAX_PDF_FILE_SIZE) {
      setFile(null);
      setError("파일이 너무 큽니다. 50MB 이하 PDF를 선택해 주세요.");
      return;
    }

    setFile(selectedFile);
    if (!forceOcr) setTitle(withoutExtension(selectedFile.name));
    setBusy(true);
    setBusyMessage(forceOcr ? "OCR로 다시 읽을 준비를 하는 중…" : "PDF를 읽는 중…");
    try {
      const extracted = await extractDocumentFromFile(selectedFile, {
        forceOcr,
        onProgress: (progress) => setBusyMessage(describeProgress(progress)),
      });
      setText(extracted.text);
      setPageCount(extracted.pageCount ?? 0);
      setOcrUsed(Boolean(extracted.ocrUsed));
      if (extracted.ocrPageLimitReached) {
        setNotice(`스캔 OCR로 앞 ${extracted.ocrPagesProcessed ?? 30}페이지를 읽었습니다. 브라우저 보호를 위해 나머지 페이지는 제외했습니다.`);
      } else if (extracted.ocrUsed) {
        setNotice("PDF에 글자 정보가 부족해 화질을 보정한 뒤 영어·한국어 OCR로 추출했습니다. 결과를 한 번 확인해 주세요.");
      } else if (extracted.text.length >= MAX_DOCUMENT_TEXT_LENGTH) {
        setNotice("추출을 완료했습니다. Moonwords 학습 한도에 맞춰 앞 120,000자까지 표시합니다.");
      } else {
        setNotice("텍스트 추출을 완료했습니다. 아래에서 내용을 확인하거나 수정할 수 있습니다.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF에서 텍스트를 추출하지 못했습니다.");
    } finally {
      setBusy(false);
      setBusyMessage("PDF를 읽는 중…");
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) void extractPdf(selectedFile);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const selectedFile = event.dataTransfer.files?.[0];
    if (selectedFile) void extractPdf(selectedFile);
  };

  const copyText = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("추출한 텍스트를 클립보드에 복사했습니다.");
    } catch {
      resultRef.current?.focus();
      resultRef.current?.select();
      const copied = document.execCommand("copy");
      setNotice(copied ? "추출한 텍스트를 복사했습니다." : "자동 복사가 차단되었습니다. 텍스트를 선택해 직접 복사해 주세요.");
    }
  };

  const downloadText = () => {
    if (!text) return;
    const blob = new Blob([`\uFEFF${text}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeDownloadName(title);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice("TXT 파일 다운로드를 시작했습니다.");
  };

  const sendToMoonwords = () => {
    const normalizedText = text.trim();
    if (normalizedText.length < 40) {
      setError("Moonwords로 보내려면 텍스트가 40자 이상이어야 합니다.");
      return;
    }
    savePendingPdfTransfer({
      title: title.trim() || withoutExtension(file?.name ?? "PDF 본문"),
      text: normalizedText.slice(0, MAX_DOCUMENT_TEXT_LENGTH),
      sourceName: file?.name ?? "pdf-text.txt",
    });
    window.location.assign(new URL(MOONWORDS_HOME_HREF, window.location.href).href);
  };

  const chooseAnotherFile = () => {
    if (!fileInputRef.current || busy) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  return (
    <div className="pdf-tool-shell">
      <header className="pdf-tool-header">
        <a className="pdf-tool-brand" href={MOONWORDS_HOME_HREF} aria-label="MoonWords 홈으로 이동"><Logo /></a>
        <a className="pdf-tool-back" href={MOONWORDS_HOME_HREF}>Moonwords 학습실로 돌아가기 <span aria-hidden="true">→</span></a>
      </header>

      <main className="pdf-tool-main">
        <section className="pdf-tool-hero">
          <div>
            <span className="pdf-tool-eyebrow">FREE PDF TOOL · BROWSER ONLY</span>
            <h1>PDF에서 영어·한국어 텍스트를<br />깔끔하게 꺼내세요.</h1>
            <p>파일은 서버에 저장하지 않고 이 브라우저 안에서만 읽습니다. 일반 추출이 어려운 흐린 스캔본은 화질을 보정한 뒤 영어·한국어 OCR로 자동 전환합니다.</p>
          </div>
          <div className="pdf-tool-hero-mark"><PdfDocumentIcon /><span>PDF</span><b>→</b><span>TEXT</span></div>
        </section>

        <section className="pdf-tool-workspace" aria-live="polite">
          <label
            className={`pdf-tool-dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileInput} />
            <span className="pdf-tool-upload-icon"><PdfDocumentIcon /></span>
            <strong>{busy ? busyMessage : file ? file.name : "PDF 파일을 놓거나 눌러서 선택"}</strong>
            <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)}MB · 파일을 바꾸려면 이 영역을 누르세요` : "최대 50MB · 스캔 PDF 자동 OCR · 서버 업로드 없음"}</small>
            {busy && <i className="pdf-tool-progress" />}
          </label>

          {error && <p className="pdf-tool-message error">{error}</p>}
          {notice && <p className="pdf-tool-message success">{notice}</p>}

          {text && (
            <div className="pdf-tool-result">
              <div className="pdf-tool-result-head">
                <div>
                  <span>EXTRACTED TEXT</span>
                  <h2>추출 결과 {ocrUsed && <em>OCR</em>}</h2>
                </div>
                <div className="pdf-tool-stats">
                  {pageCount > 0 && <span><b>{pageCount.toLocaleString()}</b>페이지</span>}
                  <span><b>{text.length.toLocaleString()}</b>글자</span>
                  <span><b>{wordCount.toLocaleString()}</b>단어</span>
                </div>
              </div>

              <label className="pdf-tool-title-field">
                <span>본문 제목</span>
                <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="본문 제목을 입력하세요" />
              </label>

              <textarea
                ref={resultRef}
                value={text}
                maxLength={MAX_DOCUMENT_TEXT_LENGTH}
                onChange={(event) => setText(event.target.value)}
                aria-label="PDF에서 추출한 텍스트"
                spellCheck={false}
              />

              <div className="pdf-tool-actions">
                <button className="pdf-tool-secondary" type="button" disabled={busy} onClick={() => void copyText()}>텍스트 복사</button>
                <button className="pdf-tool-secondary" type="button" disabled={busy} onClick={downloadText}>TXT 저장</button>
                {!ocrUsed && file && <button className="pdf-tool-secondary ocr" type="button" disabled={busy} onClick={() => void extractPdf(file, true)}>OCR로 다시 읽기</button>}
                <button className="pdf-tool-secondary" type="button" disabled={busy} onClick={chooseAnotherFile}>다른 PDF</button>
                <button className="pdf-tool-primary" type="button" disabled={busy} onClick={sendToMoonwords}>Moonwords로 보내기 <span aria-hidden="true">→</span></button>
              </div>
            </div>
          )}
        </section>

        <section className="pdf-tool-guide">
          <article><span>01</span><div><b>PDF 선택</b><p>일반 PDF는 바로 읽고 이미지형 문서는 자동으로 OCR을 사용합니다.</p></div></article>
          <article><span>02</span><div><b>내용 확인</b><p>OCR 오탈자를 확인하고 제목과 텍스트를 자유롭게 다듬습니다.</p></div></article>
          <article><span>03</span><div><b>학습실 연결</b><p>Moonwords로 보내 문장별 번역과 퀴즈를 생성합니다.</p></div></article>
        </section>

        <aside className="pdf-tool-note">
          <b>알아두세요</b>
          <p>스캔 PDF는 영어·한국어 OCR로 최대 30페이지까지 읽습니다. 흐림·기울어짐·손글씨가 심하면 오탈자가 생길 수 있으니 결과를 확인해 주세요. 첫 OCR 실행 때 인식 엔진을 내려받기 위한 인터넷 연결이 필요하며, 암호로 잠긴 PDF는 열 수 없습니다.</p>
        </aside>
      </main>

      <footer className="pdf-tool-footer">
        <span>© 2026 MoonWords · PDF Text Extractor</span>
        <a href={MOONWORDS_HOME_HREF}>영어 학습실 열기</a>
      </footer>
    </div>
  );
}
