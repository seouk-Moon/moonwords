import type { OrderingQuizQuestion } from "../../app-types";

export function OrderingContextExcerpt({ question }: { question: OrderingQuizQuestion }) {
  const hasContext = Boolean(
    question.contextBefore ||
    question.contextAfter ||
    question.sameSentenceBefore ||
    question.sameSentenceAfter,
  );

  if (!hasContext) return null;

  return (
    <blockquote className="ordering-excerpt" aria-label="본문 발췌 문맥">
      {question.contextBefore && <span>{question.contextBefore} </span>}
      {question.shortened && question.sameSentenceBefore && <span>{question.sameSentenceBefore} </span>}
      <b className="ordering-excerpt-blank" aria-label="배열할 부분">________</b>
      {question.shortened && question.sameSentenceAfter && <span> {question.sameSentenceAfter}</span>}
      {question.contextAfter && <span> {question.contextAfter}</span>}
    </blockquote>
  );
}
