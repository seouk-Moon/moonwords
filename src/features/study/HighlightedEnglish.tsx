import type { ReactNode } from "react";
import type { VocabularyItem } from "../../types";
import { escapeRegExp } from "../../lib/app-utils";

type Match = {
  start: number;
  end: number;
  word?: VocabularyItem;
  transient?: boolean;
};

export function HighlightedEnglish({
  text,
  words,
  onOpen,
  transientWord,
  transientLoading = false,
}: {
  text: string;
  words: VocabularyItem[];
  onOpen: (word: VocabularyItem, element: HTMLButtonElement) => void;
  transientWord?: string;
  transientLoading?: boolean;
}) {
  const matches: Match[] = words.flatMap((word) => {
    const pattern = escapeRegExp(word.word.trim());
    if (!pattern) return [];
    const expression = new RegExp(pattern, "gi");
    return [...text.matchAll(expression)].filter((match) => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      return !/[A-Za-z']/.test(text[start - 1] ?? "") && !/[A-Za-z']/.test(text[end] ?? "");
    }).map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, word }));
  });

  if (transientWord?.trim()) {
    const pattern = escapeRegExp(transientWord.trim());
    const expression = new RegExp(pattern, "gi");
    matches.push(...[...text.matchAll(expression)].filter((match) => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      return !/[A-Za-z']/.test(text[start - 1] ?? "") && !/[A-Za-z']/.test(text[end] ?? "");
    }).map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, transient: true })));
  }

  const sorted = matches.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    if (Boolean(left.word) !== Boolean(right.word)) return left.word ? -1 : 1;
    return right.end - right.start - (left.end - left.start);
  });
  const accepted = sorted.filter((match, index) => !sorted.slice(0, index).some((other) => other.start <= match.start && other.end > match.start));
  if (!accepted.length) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  accepted.forEach((match) => {
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    if (match.word) {
      parts.push(
        <button
          type="button"
          className="saved-word-highlight"
          key={`${match.word.id}-${match.start}`}
          title={`${match.word.word}: ${match.word.meaning}`}
          onMouseUp={(event) => event.stopPropagation()}
          onClick={(event) => onOpen(match.word!, event.currentTarget)}
        >
          {text.slice(match.start, match.end)}
        </button>,
      );
    } else {
      parts.push(
        <mark
          className={`lookup-word-highlight ${transientLoading ? "loading" : ""}`}
          key={`lookup-${match.start}-${match.end}`}
          title={transientLoading ? "뜻을 찾는 중" : "선택한 단어"}
        >
          {text.slice(match.start, match.end)}
        </mark>,
      );
    }
    cursor = match.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
