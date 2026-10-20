import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { extractDocumentFromFile } from '../../lib/file-parsers';

/** Render notes visually so handwriting/highlighting is not lost in PDF text extraction. */
export async function readClassNotes(file: File, progress: (message: string) => void) {
  if (file.size > 20 * 1024 * 1024) throw new Error('필기본은 20MB 이하로 선택해 주세요.');
  if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
    const { recognizePhoto } = await import("./photo-ocr");
    const result = await recognizePhoto(file, {onProgress: progress, allowSparseText:true});
    return {text:result.text, images:[result.imageDataUrl]};
  }
  if (!/\.pdf$/i.test(file.name)) {
    const result = await extractDocumentFromFile(file,{allowShortText:true});
    return {text:result.text, images:[] as string[]};
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 8) throw new Error('필기 PDF는 한 번에 8쪽까지 읽어요. 필요한 부분을 나눠서 올려 주세요.');
    const images: string[] = [], texts: string[] = [];
    for (let index=1; index<=pdf.numPages; index++) {
      progress(`필기본 ${index}/${pdf.numPages}쪽의 글씨와 표시를 읽는 중…`);
      const page = await pdf.getPage(index);
      const base = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(2,2000/Math.max(base.width,base.height))});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
      try {
        const context=canvas.getContext('2d');
        if(!context) throw new Error('필기 PDF를 읽지 못했어요.');
        await page.render({canvas,canvasContext:context,viewport}).promise;
        images.push(canvas.toDataURL('image/jpeg',.85));
        const content=await page.getTextContent();
        texts.push(`[${index}쪽] `+content.items.map(item=>'str' in item?item.str:'').join(' '));
      } finally { canvas.width=0;canvas.height=0;page.cleanup(); }
    }
    if(images.join('').length>16_000_000)throw new Error('필기 이미지가 너무 커요. PDF를 더 적은 쪽수로 나눠 주세요.');
    return {text:texts.join('\n').slice(0,120_000),images};
  } finally { await task.destroy(); }
}
