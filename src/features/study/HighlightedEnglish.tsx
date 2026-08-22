import type { ReactNode } from "react";
import type { VocabularyItem } from "../../types";
import { escapeRegExp } from "../../lib/app-utils";

export function HighlightedEnglish({ text, words, onOpen }: { text: string; words: VocabularyItem[]; onOpen: (word: VocabularyItem, element: HTMLButtonElement) => void }) {
  if (!words.length) return <>{text}</>;
  const matches = words.flatMap((word) => {
    const pattern = escapeRegExp(word.word.trim());
    if (!pattern) return [];
    const expression = new RegExp(pattern, "gi");
    return [...text.matchAll(expression)].filter((match) => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      return !/[A-Za-z']/.test(text[start - 1] ?? "") && !/[A-Za-z']/.test(text[end] ?? "");
    }).map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, word }));
  }).sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start));
  const accepted = matches.filter((match, index) => !matches.slice(0, index).some((other) => other.start <= match.start && other.end > match.start));
  if (!accepted.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  accepted.forEach((match) => {
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    parts.push(<button type="button" className="saved-word-highlight" key={`${match.word.id}-${match.start}`} title={`${match.word.word}: ${match.word.meaning}`} onMouseUp={(event) => event.stopPropagation()} onClick={(event) => onOpen(match.word, event.currentTarget)}>{text.slice(match.start, match.end)}</button>);
    cursor = match.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
