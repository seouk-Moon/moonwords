import { MAX_DOCUMENT_TEXT_LENGTH } from "../lib/file-parsers";

const PDF_TRANSFER_KEY = "moonwords:pdf-text-transfer:v1";
const PDF_TRANSFER_MAX_AGE = 2 * 60 * 60 * 1000;

export type PdfTextTransfer = {
  title: string;
  text: string;
  sourceName: string;
  createdAt: number;
};

const isValidTransfer = (value: unknown): value is PdfTextTransfer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PdfTextTransfer>;
  return typeof candidate.title === "string"
    && typeof candidate.text === "string"
    && candidate.text.trim().length >= 40
    && candidate.text.length <= MAX_DOCUMENT_TEXT_LENGTH
    && typeof candidate.sourceName === "string"
    && typeof candidate.createdAt === "number"
    && Date.now() - candidate.createdAt <= PDF_TRANSFER_MAX_AGE;
};

export const savePendingPdfTransfer = (payload: Omit<PdfTextTransfer, "createdAt">) => {
  const transfer: PdfTextTransfer = { ...payload, createdAt: Date.now() };
  window.sessionStorage.setItem(PDF_TRANSFER_KEY, JSON.stringify(transfer));
};

export const readPendingPdfTransfer = (): PdfTextTransfer | null => {
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(PDF_TRANSFER_KEY);
  if (!stored) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (isValidTransfer(parsed)) return parsed;
  } catch {
    // 손상되었거나 이전 형식인 임시 데이터는 아래에서 정리합니다.
  }

  window.sessionStorage.removeItem(PDF_TRANSFER_KEY);
  return null;
};

export const clearPendingPdfTransfer = () => {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(PDF_TRANSFER_KEY);
};
