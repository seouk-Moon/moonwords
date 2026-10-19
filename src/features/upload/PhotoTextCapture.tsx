import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { clampPhotoCrop, FULL_PHOTO, photoCropFromPoints, validatePhoto, type PhotoCrop } from './photo-utils';
import './photo-capture.css';

export function PhotoTextCapture({ onRecognized, onBusyChange, onError }: {
  onRecognized: (result: {text:string;imageDataUrl:string}) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onError?: (message:string) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [crop, setCrop] = useState<PhotoCrop>(FULL_PHOTO);
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const choose = (file?: File) => {
    if (!file || busy) return;
    try { validatePhoto(file); setPhoto(file); setCrop(FULL_PHOTO); setSelecting(false); setError(''); void readPhoto(file, FULL_PHOTO); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '사진을 선택하지 못했어요.'); }
  };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  };
  const readPhoto = async (selectedPhoto = photo, selectedCrop = crop) => {
    if (!selectedPhoto || busy || controller.current) return;
    setBusy(true); onBusyChange(true); setError(''); setSelecting(false);
    const operation = new AbortController(); controller.current = operation;
    try {
      const { recognizePhoto } = await import('./photo-ocr');
      if (operation.signal.aborted) return;
      const result = await recognizePhoto(selectedPhoto, { crop: selectedCrop, signal: operation.signal, onProgress: message => { if (mounted.current) setStatus(message); } });
      if (mounted.current && !operation.signal.aborted) { await onRecognized(result); }
    } catch (caught) {
      if (mounted.current && !operation.signal.aborted) { const message=caught instanceof Error ? caught.message : '사진을 읽지 못했어요. 다시 시도해 주세요.'; setError(message); onError?.(message); }
    } finally {
      if (mounted.current) { setBusy(false); onBusyChange(false); setStatus(''); }
      controller.current = null;
    }
  };

  return <section className="photo-capture" aria-label="사진에서 본문 추가">
    <div className="photo-capture-intro"><span aria-hidden="true">▣</span><div><h2>찍고, 읽고, 바로 공부해요.</h2><p>모의고사 지문과 한글 질문·보기가 모두 나오도록 찍어 주세요. 선택하면 바로 생성합니다.</p></div></div>
    <div className="photo-capture-actions">
      <button type="button" className="primary-button" disabled={busy} onClick={() => camera.current?.click()}>촬영하고 바로 만들기</button>
      <button type="button" className="outline-button" disabled={busy} onClick={() => gallery.current?.click()}>앨범에서 선택</button>
    </div>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={gallery} type="file" accept="image/*" hidden onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} />
    <p className="photo-capture-note">촬영을 지원하는 휴대폰에서는 카메라가, PC에서는 사진 선택창이 열려요. 한국어·영어를 함께 읽고 바로 만듭니다. 선택한 사진과 인식 텍스트를 AI 분석에 전송하며, 사진 파일 대신 인식한 본문·문제·보기를 저장합니다.</p>
    {preview && <>
      <div className="photo-preview-toolbar"><b>본문 영역</b><button type="button" disabled={busy} onClick={() => setSelecting(value => !value)} aria-pressed={selecting}>{selecting ? '영역 선택 마치기' : '드래그로 영역 선택'}</button><button type="button" disabled={busy} onClick={() => { setCrop(FULL_PHOTO); setSelecting(false); }}>사진 전체</button></div>
      <div className={`photo-preview ${selecting ? 'is-selecting' : ''}`}
        onPointerDown={event => { if (!selecting || busy) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = point(event); }}
        onPointerMove={event => { if (!dragStart.current) return; setCrop(photoCropFromPoints(dragStart.current, point(event))); }}
        onPointerUp={event => { if (!dragStart.current) return; const next = photoCropFromPoints(dragStart.current, point(event)); dragStart.current = null; if (next.width < .03 || next.height < .03) setCrop(FULL_PHOTO); else setCrop(next); }}
        onPointerCancel={() => { dragStart.current = null; }}>
        <img src={preview} alt="선택한 영어 지문 사진" draggable={false} onError={() => setError('사진 미리보기를 읽지 못했어요. JPG·PNG 파일로 다시 선택해 주세요.')} />
        <div className="photo-crop-box" aria-hidden="true" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
      </div>
      {selecting && <div className="photo-crop-fields"><p>손가락이나 마우스로 본문만 감싸 주세요. 아래 숫자로도 조절할 수 있어요.</p>{(['x', 'y', 'width', 'height'] as const).map((key, index) => <label key={key}>{['왼쪽', '위쪽', '너비', '높이'][index]} %<input type="number" min={key === 'width' || key === 'height' ? 1 : 0} max="100" value={Math.round(crop[key] * 100)} onChange={event => setCrop(clampPhotoCrop({ ...crop, [key]: Number(event.target.value) / 100 }))} /></label>)}</div>}
      {status && <p role="status" className="processing">{status}</p>}
      <div className="photo-capture-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void readPhoto()}>{busy ? '사진을 읽고 있어요…' : '이 사진으로 다시 만들기'}</button>{busy && <button type="button" className="outline-button" onClick={() => controller.current?.abort()}>취소</button>}</div>
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}
