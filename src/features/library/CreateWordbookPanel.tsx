import { useState } from "react";
import type { DocumentFolder, StudyDocument } from "../../types";

export type CollectionOptions = { title: string; sourceIds: string[]; folderId: string | null; scope: "starred" | "important" | "all" };
export function CreateWordbookPanel({ documents, folders, initialFolderId, onCreate, onClose }: {
  documents: StudyDocument[]; folders: DocumentFolder[]; initialFolderId: string | null;
  onCreate: (options: CollectionOptions) => Promise<StudyDocument>; onClose: () => void;
}) {
  const [title, setTitle] = useState("별표 통합 단어장");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [folderId, setFolderId] = useState(initialFolderId ?? "");
  const [scope, setScope] = useState<CollectionOptions["scope"]>("starred");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="collection-builder" aria-labelledby="collection-builder-title">
    <div className="collection-builder-head"><div><span className="eyebrow">COLLECT WORDS</span><h2 id="collection-builder-title">여러 본문으로 통합 단어장 만들기</h2></div><button disabled={busy} onClick={onClose}>닫기</button></div>
    <form onSubmit={event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError("");
      void onCreate({ title, sourceIds, folderId: folderId || null, scope }).then(onClose).catch(err => {
        setError(err instanceof Error ? err.message : "단어장을 만들지 못했어요.");
      }).finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy}>
        <div className="collection-fields">
          <label>단어장 이름<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>모을 단어<select aria-label="모을 단어" value={scope} onChange={e => setScope(e.target.value as CollectionOptions["scope"])}>
            <option value="starred">별표한 단어만</option><option value="important">더 중요 표시한 단어만</option><option value="all">저장한 단어 전체</option>
          </select></label>
          <label>저장할 폴더<select aria-label="저장할 폴더" value={folderId} onChange={e => setFolderId(e.target.value)}><option value="">미분류</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        </div>
        <div className="collection-source-head"><b>합칠 본문 선택 · {sourceIds.length}개</b><div>
          <button type="button" onClick={() => setSourceIds(documents.slice(0, 100).map(d => d.id))}>전체 선택{documents.length > 100 ? " (최대 100개)" : ""}</button>
          <button type="button" onClick={() => setSourceIds([])}>선택 해제</button>
        </div></div>
        <div className="collection-source-list">{documents.map(doc => <label key={doc.id}>
          <input type="checkbox" checked={sourceIds.includes(doc.id)} disabled={!sourceIds.includes(doc.id) && sourceIds.length >= 100}
            onChange={e => setSourceIds(ids => e.target.checked ? [...ids, doc.id] : ids.filter(id => id !== doc.id))} />
          <span><b>{doc.title}</b><small>{doc.analysis.collection ? "통합 단어장" : "본문"} · {folders.find(f => f.id === doc.folder_id)?.name ?? "미분류"}</small></span>
        </label>)}</div>
        <p className="collection-help">선택한 본문의 단어와 원본 예문을 새 단어장에 복사합니다. 같은 단어·뜻은 하나로 합치고 별표·중요 표시를 이어받아요. 새 단어장의 학습 기록은 별도로 시작합니다.</p>
        <button className="primary-button" disabled={!sourceIds.length || !title.trim()}>{busy ? "저장 중…" : "통합 단어장 저장하기"}</button>
      </fieldset>
      {error && <p className="collection-error" role="alert">{error}</p>}
    </form>
  </section>;
}
