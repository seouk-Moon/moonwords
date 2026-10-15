import { useState } from "react";
import "./manual-word.css";

export type ManualWordDraft = { word: string; meaning: string; source_sentence: string; translation: string; note: string };
const empty: ManualWordDraft = { word: "", meaning: "", source_sentence: "", translation: "", note: "" };

export function AddWordForm({ onAdd, onSaved }: { onAdd: (draft: ManualWordDraft) => Promise<void>; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return <section className="manual-word-add"><button className="outline-button" disabled={busy} aria-expanded={open} onClick={() => { setOpen((value) => !value); setNotice(""); }}>＋ 단어 직접 추가</button>
    {open && <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setNotice("");
      try {
        const payload = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as ManualWordDraft;
        if (!payload.word || !payload.meaning) throw new Error("단어와 뜻을 입력해 주세요.");
        await onAdd(payload); setDraft(empty); setOpen(false); setNotice("단어를 추가했어요."); onSaved();
      } catch (error) { setNotice(error instanceof Error ? error.message : "추가하지 못했어요. 다시 시도해 주세요."); }
      finally { setBusy(false); }
    }}>
      <div>{([["word", "단어", true], ["meaning", "뜻", true], ["source_sentence", "영어 예문 (선택)", false], ["translation", "예문 번역 (선택)", false], ["note", "메모 (선택)", false]] as const).map(([field, label, required]) => <label key={field}>{label}<input value={draft[field]} required={required} disabled={busy} maxLength={field === "word" ? 300 : 3000} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div>
      <button className="primary-button" disabled={busy || !draft.word.trim() || !draft.meaning.trim()}>{busy ? "저장 중…" : "단어 저장"}</button><button type="button" disabled={busy} onClick={() => setOpen(false)}>취소</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
