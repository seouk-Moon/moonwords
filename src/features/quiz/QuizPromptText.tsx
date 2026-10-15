import "./cloze-prompt.css";

// Keep the stored prompt intact so quiz identities and marks remain stable.
const blankPattern = /((?:[_＿][ \t]*){2,}|[□▢]+|\[\s*\]|\(\s+\)|\[\s*(?:blank|빈칸)\s*\]|\(\s*(?:blank|빈칸)\s*\))/i;

export function QuizPromptText({ text }: { text: string }) {
  return <>{text.split(blankPattern).map((part, index) => blankPattern.test(part)
    ? <span key={index} className="cloze-blank-box" role="img" aria-label="빈칸"><span aria-hidden="true">빈칸</span></span>
    : part)}</>;
}
