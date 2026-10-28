import { useMemo, useState } from "react";
import { CreateWordbookPanel, type CollectionOptions } from "./CreateWordbookPanel";
import { formatCefrLevel } from "../../lib/cefr";
import type { DocumentFolder, StudyDocument } from "../../types";
import { isCollection, matchesLibraryKind, type LibraryLocation } from "./library-location";
import "./library-kinds.css";
import {FolderShelf,ItemActions,useLibraryGestures} from "./LibraryOrganizer";
import {canMoveFolder,folderLabel,type LibraryItem} from "./folder-tree";

const ALL_FOLDER = "__all__";
const UNFILED_FOLDER = "__unfiled__";

type Props = {
  documents: StudyDocument[];
  folders: DocumentFolder[];
  onOpen: (doc: StudyDocument) => void;
  onCreateCollection: (options: CollectionOptions) => Promise<StudyDocument>;
  onUpload: (folderId?: string | null) => void;
  onPhotoUpload?: (folderId?: string | null) => void;
  onCreateFolder: (name: string, parentId?: string | null) => Promise<DocumentFolder>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onDeleteDocument: (documentId: string) => Promise<void>;
  onMoveFolder:(folderId:string,parentId:string|null)=>Promise<void>;
  onRenameDocument:(documentId:string,name:string)=>Promise<void>;
  onMoveDocument: (documentId: string, folderId: string | null) => Promise<void>;
  location: LibraryLocation;
  onLocationChange: (location: LibraryLocation) => void;
};

const formatDate = (value: string) => new Date(value).toLocaleDateString("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function LibraryPage({
  documents,
  folders,
  onOpen,
  onCreateCollection,
  onUpload,
  onPhotoUpload,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDeleteDocument,
  onMoveDocument,
  onMoveFolder,
  onRenameDocument,
  location,
  onLocationChange,
}: Props) {
  const [actionItem,setActionItem]=useState<LibraryItem|null>(null);
  const gestures=useLibraryGestures(setActionItem);
  const moveItem=async(item:LibraryItem,target:string|null)=>{
    if(item.kind==='folder'){
      if(!folders.some(f=>f.id===item.id)||!canMoveFolder(folders,item.id,target))throw new Error("자기 자신이나 하위 폴더 안으로 옮길 수 없어요.");
      await onMoveFolder(item.id,target);
    }else{
      if(!documents.some(d=>d.id===item.id))throw new Error("이동할 자료를 찾지 못했어요.");
      await onMoveDocument(item.id,target);
    }
  };
  const [creatingCollection, setCreatingCollection] = useState(false);
  const selectedFolderId = location.folderId;
  const choosingFolder = selectedFolderId === "__choose__";
  const setSelectedFolderId = (folderId: string) => onLocationChange({ ...location, folderId });
  const [folderError, setFolderError] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<StudyDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [documentError, setDocumentError] = useState("");

  const folderDocuments = useMemo(() => {
    const filtered = selectedFolderId === ALL_FOLDER
      ? documents
      : selectedFolderId === UNFILED_FOLDER
        ? documents.filter((doc) => !doc.folder_id)
        : documents.filter((doc) => doc.folder_id === selectedFolderId);
    return [...filtered].sort((first, second) => {
      const firstTime = new Date(first.last_studied_at ?? 0).getTime();
      const secondTime = new Date(second.last_studied_at ?? 0).getTime();
      return secondTime - firstTime;
    });
  }, [documents, selectedFolderId]);

  const filteredDocuments = folderDocuments.filter(doc => matchesLibraryKind(doc, location.kind));
  const groups = [
    { kind: "readings", title: "본문", items: filteredDocuments.filter(doc => !isCollection(doc)) },
    { kind: "collections", title: "통합단어장", items: filteredDocuments.filter(isCollection) },
  ].filter(group => location.kind === "all" || location.kind === group.kind);
  const recent = filteredDocuments[0];
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);

  const createFolder = async () => {
    const name = window.prompt("새 폴더 이름을 입력해 주세요.");
    if (!name?.trim()) return;
    setFolderError("");
    try {
      const folder = await onCreateFolder(name,selectedFolder?.id??null);
      setSelectedFolderId(folder.id);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "폴더를 만들지 못했습니다.");
    }
  };

  const renameSelectedFolder = async () => {
    if (!selectedFolder) return;
    const name = window.prompt("폴더 이름을 변경해 주세요.", selectedFolder.name);
    if (!name?.trim() || name.trim() === selectedFolder.name) return;
    setFolderError("");
    try {
      await onRenameFolder(selectedFolder.id, name);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "폴더 이름을 바꾸지 못했습니다.");
    }
  };

  const deleteSelectedFolder = async () => {
    if (!selectedFolder) return;
    if (!window.confirm(`“${selectedFolder.name}” 폴더를 삭제할까요?\n이 폴더 안의 자료는 미분류로, 하위 폴더는 최상위로 이동하며 내용은 삭제되지 않습니다.`)) return;
    setFolderError("");
    try {
      await onDeleteFolder(selectedFolder.id);
      setSelectedFolderId(UNFILED_FOLDER);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "폴더를 삭제하지 못했습니다.");
    }
  };

  const defaultUploadFolder = selectedFolder ? selectedFolder.id : null;

  const confirmDeleteDocument = async () => {
    if (!deleteCandidate || deletingDocument) return;
    setDeletingDocument(true);
    setDocumentError("");
    try {
      await onDeleteDocument(deleteCandidate.id);
      setDeleteCandidate(null);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "본문을 삭제하지 못했습니다.");
    } finally {
      setDeletingDocument(false);
    }
  };

  return (
    <main className="library-page modern-library">
      <section className="library-dashboard-head">
        <div>
          <span className="eyebrow">MY READINGS</span>
          <h1>내 학습 보관함</h1>
          <p>본문과 통합단어장을 나눠 확인하고, 폴더에 함께 정리하세요.</p>
        </div>
        <div className="collection-library-actions"><button className="outline-button" disabled={!documents.length} onClick={() => setCreatingCollection(true)}>☆ 통합 단어장 만들기</button>{onPhotoUpload && <button className="outline-button" onClick={() => onPhotoUpload(defaultUploadFolder)}>본문 추가</button>}<button className="primary-button new-reading-button" onClick={() => onUpload(defaultUploadFolder)}>＋ 새 본문</button></div>
      </section>


      {creatingCollection && <CreateWordbookPanel documents={documents} folders={folders} initialFolderId={defaultUploadFolder}
        onCreate={onCreateCollection} onClose={() => setCreatingCollection(false)} />}
      <FolderShelf folders={folders} documents={documents} selected={selectedFolderId} onSelect={setSelectedFolderId} onMenu={setActionItem} gestures={gestures} onMove={moveItem} onError={setFolderError}/>
      <div className="folder-actions">
        <button className="outline-button" onClick={createFolder}>＋ 새 폴더</button>
        {selectedFolder&&<><button className="outline-button" onClick={renameSelectedFolder}>이름 변경</button><button className="outline-button" onClick={deleteSelectedFolder}>폴더 삭제</button></>}
      </div>
      {folderError&&<p className="folder-error" role="alert">{folderError}</p>}
      {choosingFolder ? <p className="organize-help">폴더를 선택하면 그 안의 본문과 통합단어장이 보여요.</p> : <>
      <div className="library-kind-tabs" aria-label="학습 자료 종류">
        {([['all', '전체'], ['readings', '본문'], ['collections', '통합단어장']] as const).map(([kind, label]) => <button type="button" key={kind} aria-pressed={location.kind === kind} onClick={() => onLocationChange({ ...location, kind })}>
          {label}<span>{folderDocuments.filter(doc => matchesLibraryKind(doc, kind)).length}</span>
        </button>)}
      </div>

      {recent ? (
        <button className={`continue-reading-card ${isCollection(recent) ? "continue-collection" : ""}`} onClick={() => onOpen(recent)}>
          <div className="continue-reading-copy">
            <span className="continue-badge">{isCollection(recent) ? "통합단어장" : "본문"} · {selectedFolder ? selectedFolder.name : "최근 학습"}</span>
            <h2>{recent.title}</h2>
            <p>{recent.analysis.summary || "마지막으로 보던 본문에서 이어서 학습할 수 있어요."}</p>
            <span className="continue-action">{isCollection(recent) ? "통합단어장 열기" : "본문 이어서 읽기"} →</span>
          </div>
          <div className="continue-reading-meta">
            <strong>{recent.analysis.collection?.wordCount ?? recent.analysis.sentences.length}</strong>
            <span>{isCollection(recent) ? "단어" : "문장"}</span>
            <small>{recent.last_studied_at ? `최근 학습 ${formatDate(recent.last_studied_at)}` : "아직 학습 없음"}</small>
          </div>
        </button>
      ) : (
        <section className="library-empty-hero">
          <span className="eyebrow">EMPTY FOLDER</span>
          <h2>{location.kind === "collections" ? "이곳에는 아직 통합단어장이 없어요." : selectedFolder ? `“${selectedFolder.name}” 폴더에 본문이 없어요.` : "첫 영어 본문을 추가해보세요."}</h2>
          <p>{location.kind === "collections" ? "여러 본문의 단어를 모아 하나의 단어장으로 만들 수 있어요." : "파일이나 텍스트를 넣으면 문장별 번역, 단어, 구조와 퀴즈를 만들어드려요."}</p>
          <button className="primary-button" onClick={() => location.kind === "collections" ? setCreatingCollection(true) : onUpload(defaultUploadFolder)}>{location.kind === "collections" ? "☆ 통합 단어장 만들기" : "＋ 새 본문 만들기"}</button>
        </section>
      )}

      {groups.map(group => <section className={`document-section library-kind-section ${group.kind}`} key={group.kind} aria-label={group.title}>
        <div className="section-heading modern-section-heading">
          <div>
            <h2>{group.title}</h2>
            <span>{group.items.length}개{selectedFolder ? ` · ${selectedFolder.name}` : ""}</span>
          </div>
          <button className="text-button" onClick={() => group.kind === "collections" ? setCreatingCollection(true) : onUpload(defaultUploadFolder)}>{group.kind === "collections" ? "☆ 통합 단어장 만들기" : "＋ 새 본문"}</button>
        </div>

        <div className="document-grid">
          {group.items.map((doc) => (
            <article className={`document-card document-card-with-folder ${isCollection(doc) ? "collection-library-card" : "reading-library-card"}`} key={doc.id} {...gestures({kind:"document",id:doc.id,name:doc.title})}>
              <button className="document-open-area" onClick={() => onOpen(doc)}>
                <div className="document-card-topline">
                  <span className="doc-topic">{isCollection(doc) ? "통합단어장" : "본문"} · {doc.analysis.topic || (isCollection(doc) ? "모아 둔 단어" : "English Reading")}</span>
                  <span className="document-date">{doc.last_studied_at ? `최근 학습 ${formatDate(doc.last_studied_at)}` : "아직 학습 없음"}</span>
                </div>
                <h3>{doc.title}</h3>
                <p>{doc.analysis.summary}</p>
              </button>
              <footer>
                <button type="button" data-item-menu className="item-more" aria-label={`${doc.title} 자료 메뉴`} onClick={()=>setActionItem({kind:"document",id:doc.id,name:doc.title})}>⋯</button>
                <span>{isCollection(doc) ? `${doc.analysis.collection?.wordCount ?? doc.analysis.sentences.length}개 단어 · 통합단어장` : `${doc.analysis.sentences.length} 문장 · ${formatCefrLevel(doc.analysis.level)}`}</span>
                <label className="folder-select-label" onClick={(event) => event.stopPropagation()}>
                  <span>폴더</span>
                  <select
                    value={doc.folder_id ?? ""}
                    onChange={(event) => { void onMoveDocument(doc.id, event.target.value || null).catch(error=>setFolderError(error instanceof Error?error.message:"이동하지 못했어요.")); }}
                    aria-label={`${doc.title} 폴더 이동`}
                  >
                    <option value="">미분류</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folderLabel(folders,folder.id)}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className="document-delete-button"
                  onClick={() => { setDocumentError(""); setDeleteCandidate(doc); }}
                  aria-label={`${doc.title} ${isCollection(doc) ? "통합단어장" : "본문"} 삭제`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>
                  삭제
                </button>
              </footer>
            </article>
          ))}
        </div>

        {group.items.length === 0 && documents.length > 0 && (
          <div className="empty-state">
            <b>아직 {group.title}이 없어요.</b>
            <p>다른 자료의 폴더 메뉴에서 이 폴더로 옮길 수 있어요.</p>
          </div>
        )}
      </section>)}

      </>}

      {actionItem&&<ItemActions key={`${actionItem.kind}:${actionItem.id}`} item={actionItem} folders={folders} onClose={()=>setActionItem(null)} onMove={moveItem} onRename={async(item,name)=>{if(item.kind==='folder')await onRenameFolder(item.id,name);else await onRenameDocument(item.id,name);}}/>}
      {deleteCandidate && (
        <div className="document-delete-overlay" role="presentation" onMouseDown={() => { if (!deletingDocument) setDeleteCandidate(null); }}>
          <section className="document-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="document-delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="document-delete-icon" aria-hidden="true">!</span>
            <div>
              <span className="section-kicker">DELETE READING</span>
              <h2 id="document-delete-title">이 {isCollection(deleteCandidate) ? "통합단어장을" : "본문을"} 삭제할까요?</h2>
              <strong>“{deleteCandidate.title}”</strong>
              <p>{isCollection(deleteCandidate) ? "이 통합단어장과 연결된 단어·학습 기록이 삭제됩니다. 단어를 가져온 원본 본문은 유지됩니다." : "본문과 연결된 단어장, 진도, 퀴즈 기록 및 업로드 원본 파일이 함께 삭제됩니다."} 이 작업은 되돌릴 수 없습니다.</p>
              {documentError && <p className="document-delete-error" role="alert">{documentError}</p>}
              <div className="document-delete-actions">
                <button type="button" disabled={deletingDocument} onClick={() => setDeleteCandidate(null)}>취소</button>
                <button type="button" className="confirm" disabled={deletingDocument} onClick={() => { void confirmDeleteDocument(); }}>{deletingDocument ? "삭제 중…" : `${isCollection(deleteCandidate) ? "통합단어장" : "본문"} 영구 삭제`}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
