import { useState } from "react";
import * as XLSX from "xlsx";
import type { StudyProgress, VocabularyItem } from "../../types";
import { readWordQuizRecentResults, summarizeRecentResults } from "./recent-results";

export function Wordbook({ words, progress, onUpdate, onDelete, onStudy }: { words: VocabularyItem[]; progress: StudyProgress; onUpdate: (item: VocabularyItem) => void; onDelete: (id: string) => void; onStudy: () => void }) {
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<"full" | "compact">("full");
  const filtered = words.filter((item) => `${item.word} ${item.meaning}`.toLowerCase().includes(query.toLowerCase()));
  const recentResults = readWordQuizRecentResults(progress);

  const exportExcel = () => {
    const rows = exportMode === "compact"
      ? words.map((item) => ({ 단어: item.word, 뜻: item.meaning }))
      : words.map((item) => {
          const recent = summarizeRecentResults(recentResults[item.id]);
          return {
            단어: item.word,
            뜻: item.meaning,
            영어문장: item.source_sentence,
            번역: item.translation,
            메모: item.note,
            상태: item.status === "mastered" ? "완료" : "학습중",
            최근기록수: recent.total,
            최근10회정답: recent.correct,
            최근10회오답: recent.incorrect,
          };
        });
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, exportMode === "compact" ? "단어와 뜻" : "전체 단어장");
    XLSX.writeFile(book, `MoonWords_${exportMode === "compact" ? "word_meaning" : "full"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return <main className="tool-page">
    <div className="tool-heading">
      <div><span className="eyebrow">MY VOCABULARY</span><h1>단어장</h1><p>드래그해 저장한 뜻과 원문을 함께 복습하세요.</p></div>
      <div className="export-controls"><label><span>내보낼 내용</span><select value={exportMode} onChange={(event) => setExportMode(event.target.value as "full" | "compact")}><option value="full">전체 정보</option><option value="compact">단어 + 뜻만</option></select></label><button className="outline-button" onClick={exportExcel} disabled={!words.length}>↓ Excel 내보내기</button></div>
    </div>
    <div className="filter-bar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="단어 또는 뜻 검색" /><span>{filtered.length} WORDS</span></div>
    <div className="word-list">{filtered.map((word) => {
      const recent = summarizeRecentResults(recentResults[word.id]);
      return <article className="word-card" key={word.id}>
        <div className="word-main"><span className={`status-dot ${word.status}`} /><div><input className="word-title" value={word.word} onChange={(e) => onUpdate({ ...word, word: e.target.value })} /><input className="word-meaning" value={word.meaning} onChange={(e) => onUpdate({ ...word, meaning: e.target.value })} /></div></div>
        <blockquote>{word.source_sentence}<small>{word.translation}</small></blockquote>
        <textarea value={word.note} onChange={(e) => onUpdate({ ...word, note: e.target.value })} placeholder="암기 팁이나 예문 메모" />
        <footer>
          <button onClick={() => onUpdate({ ...word, status: word.status === "learning" ? "mastered" : "learning" })}>{word.status === "mastered" ? "✓ 암기 완료" : "학습 중"}</button>
          <span className="recent-word-score" title="단어 퀴즈에서 가장 최근에 답한 최대 10회 기준">
            {recent.total ? `최근 ${recent.total}회 · 정답 ${recent.correct} · 오답 ${recent.incorrect}` : "최근 퀴즈 기록 없음"}
          </span>
          {confirmDeleteId === word.id ? <div className="word-delete-confirm" role="alert"><span>정말 삭제하시겠습니까?</span><button onClick={() => setConfirmDeleteId(null)}>취소</button><button className="danger confirm" onClick={() => { onDelete(word.id); setConfirmDeleteId(null); }}>삭제</button></div> : <button className="danger" onClick={() => setConfirmDeleteId(word.id)}>삭제</button>}
        </footer>
      </article>;
    })}</div>
    {!filtered.length && <div className="empty-state"><b>{words.length ? "검색 결과가 없어요." : "아직 저장한 단어가 없어요."}</b><p>본문에서 모르는 단어를 드래그하면 여기에 쌓입니다.</p><button className="primary-button" onClick={onStudy}>본문으로 가기</button></div>}
  </main>;
}
