import "./word-sources.css";

export function WordSourceLabel({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return <p className="word-source-label"><b>원본 본문</b><span>{sources.join(" · ")}</span></p>;
}
