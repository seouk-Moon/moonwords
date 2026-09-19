export const MAX_DOCUMENT_TEXT_LENGTH = 120_000;

export type DocumentExtractionProgress = {
  stage: "reading" | "ocr-loading" | "ocr-rendering" | "ocr-recognizing";
  currentPage: number;
  totalPages: number;
  progress: number;
};

export type DocumentExtractionOptions = {
  /** 텍스트 레이어 결과와 관계없이 스캔 OCR로 다시 읽습니다. */
  forceOcr?: boolean;
  onProgress?: (progress: DocumentExtractionProgress) => void;
};

export type ExtractedDocumentContent = {
  text: string;
  /** 원본에서 밑줄 친 문장/문장 조각. AI 분석 결과의 문장과 매칭해 ★ 표시하는 데 사용합니다. */
  markedFragments: string[];
  /** PDF일 때만 제공되는 전체 페이지 수 */
  pageCount?: number;
  /** 이미지형 PDF를 브라우저 OCR로 읽었는지 여부 */
  ocrUsed?: boolean;
  /** 브라우저 보호를 위한 OCR 페이지 제한에 도달했는지 여부 */
  ocrPageLimitReached?: boolean;
  /** 실제 OCR로 처리한 페이지 수 */
  ocrPagesProcessed?: number;
};

const cleanText = (value: string) =>
  value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_DOCUMENT_TEXT_LENGTH);

const normalizeForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[“”‘’"']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const splitEnglishSentences = (value: string) => {
  const matches = value
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+(?:[.!?]+[”"']?|$)/g);
  return (matches ?? [value]).map((item) => item.trim()).filter(Boolean);
};

const surroundingSentenceForMark = (blockText: string, markedText: string) => {
  const mark = normalizeForMatch(markedText);
  if (!mark) return "";
  const sentence = splitEnglishSentences(blockText).find((item) => {
    const normalized = normalizeForMatch(item);
    return normalized.includes(mark) || mark.includes(normalized);
  });
  return sentence || blockText.trim();
};

const readableCharacterCount = (value: string) => value.match(/[A-Za-z0-9]/g)?.length ?? 0;

const needsOcrFallback = (value: string, pages: string[]) => {
  const compact = value.replace(/\s/g, "");
  const readableCharacters = readableCharacterCount(compact);
  const pagesWithReadableText = pages.filter((page) => readableCharacterCount(page) >= 30).length;
  const tooManyImageOnlyPages = pages.length > 1 && pagesWithReadableText < Math.ceil(pages.length * .5);
  return compact.length < 40
    || readableCharacters < 30
    || readableCharacters / Math.max(compact.length, 1) < .35
    || tooManyImageOnlyPages;
};

type UnderlineAnnotation = {
  subtype: "Underline";
  rect: [number, number, number, number];
};

const isUnderlineAnnotation = (value: unknown): value is UnderlineAnnotation => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { subtype?: unknown; rect?: unknown };
  return candidate.subtype === "Underline"
    && Array.isArray(candidate.rect)
    && candidate.rect.length >= 4
    && candidate.rect.slice(0, 4).every((coordinate) => typeof coordinate === "number");
};

const parsePdf = async (
  file: File,
  options: DocumentExtractionOptions,
): Promise<ExtractedDocumentContent> => {
  const [pdfjs, pdfWorker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  const markedFragments: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    options.onProgress?.({
      stage: "reading",
      currentPage: pageNumber,
      totalPages: document.numPages,
      progress: pageNumber / document.numPages,
    });
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const textItems = content.items.filter((item) => "str" in item) as Array<{
      str: string;
      hasEOL?: boolean;
      transform?: number[];
      width?: number;
      height?: number;
    }>;
    pages.push(textItems.map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`).join("").trim());

    // PDF.js exposes real underline annotations. When present, match the annotation rectangle
    // to nearby text items and keep the whole visual line as context. Decorative drawn lines
    // are not reliably distinguishable from other PDF graphics, so those remain unchanged.
    try {
      const annotations: unknown[] = await page.getAnnotations({ intent: "display" });
      const underlineAnnotations = annotations.filter(isUnderlineAnnotation);
      for (const annotation of underlineAnnotations) {
        const [x1, y1, x2, y2] = annotation.rect;
        const underlinedItems = textItems.filter((item) => {
          const transform = item.transform;
          if (!transform) return false;
          const x = transform[4] ?? 0;
          const y = transform[5] ?? 0;
          const width = Number(item.width ?? 0);
          const height = Math.max(4, Math.abs(Number(item.height ?? transform[3] ?? 0)));
          const horizontalOverlap = x + width >= Math.min(x1, x2) - 3 && x <= Math.max(x1, x2) + 3;
          const verticalOverlap = y + height >= Math.min(y1, y2) - 5 && y - height <= Math.max(y1, y2) + 5;
          return horizontalOverlap && verticalOverlap;
        });
        if (!underlinedItems.length) continue;
        const referenceY = Number(underlinedItems[0].transform?.[5] ?? 0);
        const lineText = textItems
          .filter((item) => Math.abs(Number(item.transform?.[5] ?? 0) - referenceY) <= 4)
          .map((item) => item.str)
          .join(" ")
          .trim();
        if (lineText) markedFragments.push(lineText);
      }
    } catch {
      // Text extraction still succeeds even when annotations are unavailable.
    }
  }

  const embeddedText = pages.join("\n\n");
  if (options.forceOcr || needsOcrFallback(embeddedText, pages)) {
    const { recognizePdfWithOcr } = await import("../pdf-extractor/ocr");
    const ocr = await recognizePdfWithOcr(document, options.onProgress);
    return {
      text: ocr.text,
      markedFragments: [],
      pageCount: document.numPages,
      ocrUsed: true,
      ocrPageLimitReached: ocr.pageLimitReached,
      ocrPagesProcessed: ocr.pagesProcessed,
    };
  }

  return { text: embeddedText, markedFragments, pageCount: document.numPages, ocrUsed: false };
};

const parseDocx = async (file: File): Promise<ExtractedDocumentContent> => {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();

  // Mammoth can expose Word underline runs through a style map while still keeping
  // the original paragraph text. We use the HTML only to discover marks; the saved
  // source text stays clean plain text.
  const [rawResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml(
      { arrayBuffer },
      { styleMap: ["u => span.mw-source-underline"] },
    ),
  ]);

  const markedFragments: string[] = [];
  try {
    const parsed = new DOMParser().parseFromString(htmlResult.value, "text/html");
    parsed.querySelectorAll(".mw-source-underline").forEach((mark) => {
      const markedText = mark.textContent?.trim() ?? "";
      if (!markedText) return;
      const block = mark.closest("p, li, blockquote, td, th") ?? mark.parentElement;
      const blockText = block?.textContent?.trim() ?? markedText;
      const fragment = surroundingSentenceForMark(blockText, markedText);
      if (fragment) markedFragments.push(fragment);
    });
  } catch {
    // Unsupported or unusual DOCX markup should not stop plain-text extraction.
  }

  return { text: rawResult.value, markedFragments };
};

const parseTextLike = async (file: File): Promise<ExtractedDocumentContent> => {
  const value = await file.text();
  // Markdown has no universal underline syntax. Keep content intact; explicit HTML <u>
  // is recognized when users happen to include it in .md/.txt content.
  const markedFragments: string[] = [];
  const underlinePattern = /<u>([\s\S]*?)<\/u>/gi;
  let match: RegExpExecArray | null;
  while ((match = underlinePattern.exec(value))) {
    const visible = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (visible) markedFragments.push(visible);
  }
  return { text: value.replace(/<\/?u>/gi, ""), markedFragments };
};

export const extractDocumentFromFile = async (
  file: File,
  options: DocumentExtractionOptions = {},
): Promise<ExtractedDocumentContent> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let result: ExtractedDocumentContent;

  if (file.type === "application/pdf" || extension === "pdf") {
    result = await parsePdf(file, options);
  } else if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    result = await parseDocx(file);
  } else if (
    file.type.startsWith("text/") ||
    ["txt", "md"].includes(extension ?? "")
  ) {
    result = await parseTextLike(file);
  } else {
    throw new Error("PDF, DOCX, TXT, MD 파일만 지원합니다.");
  }

  const cleaned = cleanText(result.text);
  if (cleaned.length < 40) {
    throw new Error("본문을 충분히 추출하지 못했습니다. 텍스트를 직접 붙여 넣어 주세요.");
  }
  return {
    text: cleaned,
    markedFragments: [...new Set(result.markedFragments.map(cleanText).filter(Boolean))],
    ...(result.pageCount ? { pageCount: result.pageCount } : {}),
    ...(typeof result.ocrUsed === "boolean" ? { ocrUsed: result.ocrUsed } : {}),
    ...(result.ocrPageLimitReached ? { ocrPageLimitReached: true } : {}),
    ...(result.ocrPagesProcessed ? { ocrPagesProcessed: result.ocrPagesProcessed } : {}),
  };
};

/** 기존 호출부 호환용 */
export const extractTextFromFile = async (file: File) => (await extractDocumentFromFile(file)).text;

export const normalizePastedText = (value: string) => {
  const cleaned = cleanText(value);
  if (cleaned.length < 40) {
    throw new Error("분석할 본문을 40자 이상 입력해 주세요.");
  }
  return cleaned;
};
