import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import type { DocumentExtractionProgress } from "../lib/file-parsers";

export const OCR_PAGE_LIMIT = 30;
const OCR_TARGET_LONG_EDGE = 2_500;
const OCR_MAX_SCALE = 3;
const OCR_MIN_SCALE = 1.8;

export type PdfOcrResult = {
  text: string;
  pagesProcessed: number;
  pageLimitReached: boolean;
};

const improveScanContrast = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = (pixels[index] * .299) + (pixels[index + 1] * .587) + (pixels[index + 2] * .114);
    const contrasted = Math.max(0, Math.min(255, ((gray - 128) * 1.35) + 128));
    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
    pixels[index + 3] = 255;
  }

  context.putImageData(image, 0, 0);
};

const renderPageForOcr = async (document: PDFDocumentProxy, pageNumber: number) => {
  const page = await document.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const longestEdge = Math.max(baseViewport.width, baseViewport.height);
  const scale = Math.min(
    OCR_MAX_SCALE,
    Math.max(OCR_MIN_SCALE, OCR_TARGET_LONG_EDGE / Math.max(longestEdge, 1)),
  );
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("브라우저에서 PDF 이미지를 준비하지 못했습니다.");

  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  improveScanContrast(context, canvas.width, canvas.height);
  return canvas;
};

export const recognizePdfWithOcr = async (
  document: PDFDocumentProxy,
  onProgress?: (progress: DocumentExtractionProgress) => void,
): Promise<PdfOcrResult> => {
  const totalPages = document.numPages;
  const pagesToProcess = Math.min(totalPages, OCR_PAGE_LIMIT);
  let activePage = 0;
  let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;

  onProgress?.({ stage: "ocr-loading", currentPage: 0, totalPages, progress: 0 });

  try {
    const tesseract = await import("tesseract.js");
    worker = await tesseract.createWorker(["eng", "kor"], tesseract.OEM.LSTM_ONLY, {
      logger: (message) => {
        const recognizing = message.status === "recognizing text" && activePage > 0;
        onProgress?.({
          stage: recognizing ? "ocr-recognizing" : "ocr-loading",
          currentPage: recognizing ? activePage : 0,
          totalPages,
          progress: Number.isFinite(message.progress) ? message.progress : 0,
        });
      },
    });
    await worker.setParameters({
      tessedit_pageseg_mode: tesseract.PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      activePage = pageNumber;
      onProgress?.({ stage: "ocr-rendering", currentPage: pageNumber, totalPages, progress: 0 });
      const canvas = await renderPageForOcr(document, pageNumber);
      const result = await worker.recognize(canvas, { rotateAuto: true });
      pages.push(result.data.text.trim());
      canvas.width = 1;
      canvas.height = 1;
    }

    return {
      text: pages.filter(Boolean).join("\n\n"),
      pagesProcessed: pagesToProcess,
      pageLimitReached: totalPages > pagesToProcess,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`스캔 PDF OCR을 완료하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. (${detail})`);
  } finally {
    if (worker) await worker.terminate();
  }
};
