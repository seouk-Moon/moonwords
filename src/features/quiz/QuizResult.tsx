import { useState } from "react";
import type { QuizMistakeReviewItem } from "../../app-types";

const HighlightedMistakeSentence = ({ sentence, testedPart }: { sentence: string; testedPart?: string }) => {
  const normalizedSentence = sentence.replace(/\s+/g, " ").trim();
  const normalizedPart = testedPart?.replace(/\s+/g, " ").trim();
  if (!normalizedPart) return <>{normalizedSentence}</>;
  const start = normalizedSentence.toLocaleLowerCase().indexOf(normalizedPart.toLocaleLowerCase());
  if (start < 0) return <>{normalizedSentence}</>;
  const end = start + normalizedPart.length;
  return <>{normalizedSentence.slice(0, start)}<mark className="mistake-tested-part">{normalizedSentence.slice(start, end)}</mark>{normalizedSentence.slice(end)}</>;
};

export function QuizResult({
  score,
  total,
  summary,
  mistakes,
  canRetryIncorrect,
  onRetryIncorrect,
  onShuffleAll,
  onHome,
  compactFlashcardMistakes = false,
}: {
  score: number;
  total: number;
  summary: string;
  mistakes: QuizMistakeReviewItem[];
  canRetryIncorrect: boolean;
  onRetryIncorrect: () => void;
  onShuffleAll: () => void;
  onHome: () => void;
  compactFlashcardMistakes?: boolean;
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
            {mistakes.length ? "오답 확인하기" : "오답 없음"}
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
          <div className={`mistake-review-list ${compactFlashcardMistakes ? "flashcard-mistake-review-list" : ""}`}>
            {mistakes.map((mistake, index) => compactFlashcardMistakes ? (
              <article className="flashcard-mistake-review-item" key={mistake.id}>
                <div>
                  <p className="flashcard-mistake-sentence">
                    <HighlightedMistakeSentence sentence={mistake.sourceSentence || mistake.prompt} testedPart={mistake.testedPart} />
                  </p>
                  <p className="flashcard-mistake-meaning">{mistake.answer}</p>
                </div>
              </article>
            ) : (
              <article key={mistake.id}>
                <span>{index + 1}</span>
                <div>
                  <h3>{mistake.prompt}</h3>
                  {mistake.sourceSentence && (
                    <div className="mistake-source-sentence">
                      <small>전체 문장</small>
                      <p><HighlightedMistakeSentence sentence={mistake.sourceSentence} testedPart={mistake.testedPart} /></p>
                    </div>
                  )}
                  {mistake.testedPart && <p className="mistake-tested-copy"><b>출제 부분</b><span>{mistake.testedPart}</span></p>}
                  {mistake.selected && <p className="mistake-selected"><b>내 답</b><span>{mistake.selected}</span></p>}
                  <p className="mistake-answer"><b>정답</b><span>{mistake.answer}</span></p>
                  {mistake.explanation && mistake.explanation.trim() !== mistake.sourceSentence?.trim() && <small className="mistake-explanation">{mistake.explanation}</small>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
