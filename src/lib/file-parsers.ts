const MAX_TEXT_LENGTH = 120_000;

const cleanText = (value: string) =>
  value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

const parsePdf = async (file: File) => {
  const [pdfjs, pdfWorker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  return pages.join("\n\n");
};

const parseDocx = async (file: File) => {
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
};

export const extractTextFromFile = async (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  if (file.type === "application/pdf" || extension === "pdf") {
    text = await parsePdf(file);
  } else if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    text = await parseDocx(file);
  } else if (
    file.type.startsWith("text/") ||
    ["txt", "md"].includes(extension ?? "")
  ) {
    text = await file.text();
  } else {
    throw new Error("PDF, DOCX, TXT, MD 파일만 지원합니다.");
  }

  const cleaned = cleanText(text);
  if (cleaned.length < 40) {
    throw new Error("본문을 충분히 추출하지 못했습니다. 텍스트를 직접 붙여 넣어 주세요.");
  }
  return cleaned;
};

export const normalizePastedText = (value: string) => {
  const cleaned = cleanText(value);
  if (cleaned.length < 40) {
    throw new Error("분석할 본문을 40자 이상 입력해 주세요.");
  }
  return cleaned;
};
