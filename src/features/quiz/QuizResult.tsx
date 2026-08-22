import { useState } from "react";
import type { QuizMistakeReviewItem } from "../../app-types";

export function QuizResult({
  score,
  total,
  summary,
  mistakes,
  canRetryIncorrect,
  onRetryIncorrect,
  onShuffleAll,
  onHome,
}: {
  score: number;
  total: number;
  summary: string;
  mistakes: QuizMistakeReviewItem[];
  canRetryIncorrect: boolean;
  onRetryIncorrect: () => void;
  onShuffleAll: () => void;
  onHome: () => void;
}) {
  const [showMistakes, setShowMistakes] = useState(false);

  return (
    <div className="quiz-result-stack">
      <div className="result-card">
        <span>RESULT</span>
        <strong>{score} / {total}</strong>
        <p>{summary}</p>
        <div className="result-actions">
          {canRetryIncorrect && <button onClick={onRetryIncorrect}>오답만 풀기</button>}
          <button className="primary-button" onClick={onShuffleAll}>전체 섞어서 풀기</button>
          <button onClick={() => setShowMistakes((value) => !value)} disabled={!mistakes.length}>
            {mistakes.length ? `오답 확인하기 ${mistakes.length}` : "오답 없음"}
          </button>
          <button onClick={onHome}>처음으로</button>
        </div>
      </div>

      {showMistakes && mistakes.length > 0 && (
        <section className="mistake-review" aria-label="이번 퀴즈 오답 확인">
          <header>
            <div><span>REVIEW</span><h2>이번 퀴즈 오답</h2></div>
            <button onClick={() => setShowMistakes(false)}>닫기</button>
          </header>
          <div className="mistake-review-list">
            {mistakes.map((mistake, index) => (
              <article key={mistake.id}>
                <span>{index + 1}</span>
                <div>
                  <h3>{mistake.prompt}</h3>
                  {mistake.selected && <p className="mistake-selected">내 답: {mistake.selected}</p>}
                  <p className="mistake-answer">정답: {mistake.answer}</p>
                  {mistake.explanation && <small>{mistake.explanation}</small>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
