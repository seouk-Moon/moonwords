import { useMemo, useState } from "react";
import type { DocumentFolder, StudyDocument } from "../../types";
import type { LearningAnalyticsSnapshot } from "../progress/learning-analytics";
import { LearningDashboard } from "../progress/LearningDashboard";

const ALL_FOLDER = "__all__";
const UNFILED_FOLDER = "__unfiled__";

type Props = {
  documents: StudyDocument[];
  folders: DocumentFolder[];
  onOpen: (doc: StudyDocument) => void;
  onUpload: (folderId?: string | null) => void;
  onCreateFolder: (name: string) => Promise<DocumentFolder>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onMoveDocument: (documentId: string, folderId: string | null) => Promise<void>;
  learningAnalytics: LearningAnalyticsSnapshot;
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
  onUpload,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveDocument,
  learningAnalytics,
}: Props) {
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ALL_FOLDER);
  const [folderError, setFolderError] = useState("");

  const filteredDocuments = useMemo(() => {
    if (selectedFolderId === ALL_FOLDER) return documents;
    if (selectedFolderId === UNFILED_FOLDER) return documents.filter((doc) => !doc.folder_id);
    return documents.filter((doc) => doc.folder_id === selectedFolderId);
  }, [documents, selectedFolderId]);

  const recent = filteredDocuments[0];
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const sectionTitle = selectedFolder?.name ?? (selectedFolderId === UNFILED_FOLDER ? "미분류" : "내 본문");

  const createFolder = async () => {
    const name = window.prompt("새 폴더 이름을 입력해 주세요.");
    if (!name?.trim()) return;
    setFolderError("");
    try {
      const folder = await onCreateFolder(name);
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
    if (!window.confirm(`“${selectedFolder.name}” 폴더를 삭제할까요?\n본문은 삭제되지 않고 미분류로 이동합니다.`)) return;
    setFolderError("");
    try {
      await onDeleteFolder(selectedFolder.id);
      setSelectedFolderId(UNFILED_FOLDER);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "폴더를 삭제하지 못했습니다.");
    }
  };

  const defaultUploadFolder = selectedFolder ? selectedFolder.id : null;

  return (
    <main className="library-page modern-library">
      <section className="library-dashboard-head">
        <div>
          <span className="eyebrow">MY STUDY</span>
          <h1>내 학습</h1>
          <p>이번 주 성장 기록을 확인하고, 이어서 학습할 본문을 선택하세요.</p>
        </div>
        <button className="primary-button new-reading-button" onClick={() => onUpload(defaultUploadFolder)}>＋ 새 본문</button>
      </section>

      <LearningDashboard analytics={learningAnalytics} />

      <section className="folder-toolbar" aria-label="본문 폴더">
        <div className="folder-list">
          <button className={selectedFolderId === ALL_FOLDER ? "active" : ""} onClick={() => setSelectedFolderId(ALL_FOLDER)}>
            전체 <b>{documents.length}</b>
          </button>
          <button className={selectedFolderId === UNFILED_FOLDER ? "active" : ""} onClick={() => setSelectedFolderId(UNFILED_FOLDER)}>
            미분류 <b>{documents.filter((doc) => !doc.folder_id).length}</b>
          </button>
          {folders.map((folder) => (
            <button key={folder.id} className={selectedFolderId === folder.id ? "active" : ""} onClick={() => setSelectedFolderId(folder.id)}>
              📁 {folder.name} <b>{documents.filter((doc) => doc.folder_id === folder.id).length}</b>
            </button>
          ))}
        </div>
        <div className="folder-actions">
          {selectedFolder && <button onClick={renameSelectedFolder}>이름 변경</button>}
          {selectedFolder && <button className="danger" onClick={deleteSelectedFolder}>폴더 삭제</button>}
          <button className="create-folder" onClick={createFolder}>＋ 새 폴더</button>
        </div>
      </section>
      {folderError && <p className="folder-error">{folderError}</p>}

      {recent ? (
        <button className="continue-reading-card" onClick={() => onOpen(recent)}>
          <div className="continue-reading-copy">
            <span className="continue-badge">{selectedFolder ? selectedFolder.name : "최근 학습"}</span>
            <h2>{recent.title}</h2>
            <p>{recent.analysis.summary || "마지막으로 보던 본문에서 이어서 학습할 수 있어요."}</p>
            <span className="continue-action">계속 학습하기 →</span>
          </div>
          <div className="continue-reading-meta">
            <strong>{recent.analysis.sentences.length}</strong>
            <span>문장</span>
            <small>{formatDate(recent.updated_at || recent.created_at)}</small>
          </div>
        </button>
      ) : (
        <section className="library-empty-hero">
          <span className="eyebrow">EMPTY FOLDER</span>
          <h2>{selectedFolder ? `“${selectedFolder.name}” 폴더가 비어 있어요.` : "첫 영어 본문을 추가해보세요."}</h2>
          <p>파일이나 텍스트를 넣으면 문장별 번역, 단어, 구조와 퀴즈를 만들어드려요.</p>
          <button className="primary-button" onClick={() => onUpload(defaultUploadFolder)}>＋ 새 본문 만들기</button>
        </section>
      )}

      <section className="document-section">
        <div className="section-heading modern-section-heading">
          <div>
            <h2>{sectionTitle}</h2>
            <span>{filteredDocuments.length}개의 본문</span>
          </div>
          <button className="text-button" onClick={() => onUpload(defaultUploadFolder)}>＋ 새 본문</button>
        </div>

        <div className="document-grid">
          {filteredDocuments.map((doc) => (
            <article className="document-card document-card-with-folder" key={doc.id}>
              <button className="document-open-area" onClick={() => onOpen(doc)}>
                <div className="document-card-topline">
                  <span className="doc-topic">{doc.analysis.topic || "English Reading"}</span>
                  <span className="document-date">{formatDate(doc.created_at)}</span>
                </div>
                <h3>{doc.title}</h3>
                <p>{doc.analysis.summary}</p>
              </button>
              <footer>
                <span>{doc.analysis.sentences.length} 문장 · {doc.analysis.level || "Reading"}</span>
                <label className="folder-select-label" onClick={(event) => event.stopPropagation()}>
                  <span>폴더</span>
                  <select
                    value={doc.folder_id ?? ""}
                    onChange={(event) => { void onMoveDocument(doc.id, event.target.value || null); }}
                    aria-label={`${doc.title} 폴더 이동`}
                  >
                    <option value="">미분류</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                </label>
              </footer>
            </article>
          ))}
        </div>

        {filteredDocuments.length === 0 && documents.length > 0 && (
          <div className="empty-state">
            <b>이 폴더에는 아직 본문이 없어요.</b>
            <p>다른 본문 카드의 폴더 메뉴에서 이 폴더로 옮길 수 있어요.</p>
          </div>
        )}
      </section>
    </main>
  );
}
