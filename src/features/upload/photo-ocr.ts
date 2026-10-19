import { clampPhotoCrop, FULL_PHOTO, validatePhoto, type PhotoCrop } from './photo-utils';

export async function recognizePhoto(file: File, options: {
  crop?: PhotoCrop;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
} = {}) {
  validatePhoto(file);
  const checkCancelled = () => {
    if (options.signal?.aborted) throw new DOMException('사진 읽기를 취소했어요.', 'AbortError');
  };
  checkCancelled();
  const abortable = <T,>(promise: PromiseLike<T>) => new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('사진 읽기를 취소했어요.', 'AbortError'));
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => options.signal?.removeEventListener('abort', abort));
  });
  const url = URL.createObjectURL(file);
  let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null;
  let canvas: HTMLCanvasElement | null = null;
  const stop = () => { void worker?.terminate().catch(() => {}); };
  options.signal?.addEventListener('abort', stop, { once: true });
  try {
    const image = new Image();
    image.src = url;
    try { await abortable(image.decode()); }
    catch { checkCancelled(); throw new Error('이 사진 형식을 읽지 못했어요. JPG·PNG 사진으로 다시 선택해 주세요.'); }
    checkCancelled();
    const crop = clampPhotoCrop(options.crop ?? FULL_PHOTO);
    const width = Math.max(1, Math.round(image.naturalWidth * crop.width));
    const height = Math.max(1, Math.round(image.naturalHeight * crop.height));
    if (width < 60 || height < 30) throw new Error('선택한 영역이 너무 작아요. 본문 전체를 포함해 주세요.');
    const scale = Math.min(2, 2500 / Math.max(width, height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 처리하지 못했어요. 다른 브라우저로 다시 시도해 주세요.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, image.naturalWidth * crop.x, image.naturalHeight * crop.y, width, height, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114;
      const value = Math.max(0, Math.min(255, (gray - 128) * 1.2 + 128));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
    options.onProgress?.('영어 글자 인식을 준비하는 중… 처음에는 조금 걸릴 수 있어요.');
    const tesseract = await abortable(import('tesseract.js'));
    checkCancelled();
    const workerCreation = tesseract.createWorker('eng', tesseract.OEM.LSTM_ONLY, {
      logger: (message: { status?: string; progress?: number }) => {
        if (options.signal?.aborted) return;
        if (message.status === 'recognizing text') options.onProgress?.(`사진 속 영어를 읽는 중… ${Math.round((message.progress ?? 0) * 100)}%`);
      },
    });
    void workerCreation.then(created => {
      if (options.signal?.aborted) void created.terminate().catch(() => {});
    }, () => {});
    worker = await abortable(workerCreation);
    checkCancelled();
    await abortable(worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.AUTO }));
    const result = await abortable(worker.recognize(canvas));
    checkCancelled();
    const text = result.data.text.replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 40) throw new Error('영어 본문을 충분히 찾지 못했어요. 밝은 곳에서 본문만 크게 찍거나, 영역을 다시 선택해 주세요.');
    if (text.length > 120_000) throw new Error('본문이 너무 길어요. 한 지문씩 나눠서 촬영해 주세요.');
    return { text, confidence: result.data.confidence };
  } finally {
    options.signal?.removeEventListener('abort', stop);
    if (worker) await worker.terminate().catch(() => {});
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    URL.revokeObjectURL(url);
  }
}
