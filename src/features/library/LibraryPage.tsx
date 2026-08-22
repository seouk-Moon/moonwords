import type { StudyDocument } from "../../types";

type Props = {
  documents: StudyDocument[];
  onOpen: (doc: StudyDocument) => void;
  onUpload: () => void;
};

const formatDate = (value: string) => new Date(value).toLocaleDateString("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function LibraryPage({ documents, onOpen, onUpload }: Props) {
  const recent = documents[0];
  const rest = recent ? documents.slice(1) : [];

  return (
    <main className="library-page modern-library">
      <section className="library-dashboard-head">
        <div>
          <span className="eyebrow">MY STUDY</span>
          <h1>내 학습</h1>
          <p>읽던 본문부터 자연스럽게 이어서 학습해보세요.</p>
        </div>
        <button className="primary-button new-reading-button" onClick={onUpload}>＋ 새 본문</button>
      </section>

      {recent ? (
        <button className="continue-reading-card" onClick={() => onOpen(recent)}>
          <div className="continue-reading-copy">
            <span className="continue-badge">최근 학습</span>
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
          <span className="eyebrow">FIRST READING</span>
          <h2>첫 영어 본문을 추가해보세요.</h2>
          <p>파일이나 텍스트를 넣으면 문장별 번역, 단어, 구조와 퀴즈를 만들어드려요.</p>
          <button className="primary-button" onClick={onUpload}>＋ 새 본문 만들기</button>
        </section>
      )}

      <section className="document-section">
        <div className="section-heading modern-section-heading">
          <div>
            <h2>내 본문</h2>
            <span>{documents.length}개의 본문</span>
          </div>
          <button className="text-button" onClick={onUpload}>＋ 새 본문</button>
        </div>

        <div className="document-grid">
          {(recent ? [recent, ...rest] : []).map((doc) => (
            <button className="document-card" key={doc.id} onClick={() => onOpen(doc)}>
              <div className="document-card-topline">
                <span className="doc-topic">{doc.analysis.topic || "English Reading"}</span>
                <span className="document-date">{formatDate(doc.created_at)}</span>
              </div>
              <h3>{doc.title}</h3>
              <p>{doc.analysis.summary}</p>
              <footer>
                <span>{doc.analysis.sentences.length} 문장</span>
                <span>{doc.analysis.level || "Reading"}</span>
              </footer>
            </button>
          ))}
        </div>

        {documents.length === 0 && (
          <div className="empty-state">
            <b>아직 저장된 본문이 없어요.</b>
            <p>첫 파일을 올려 AI 학습지를 만들어 보세요.</p>
            <button className="primary-button" onClick={onUpload}>첫 본문 추가</button>
          </div>
        )}
      </section>
    </main>
  );
}
