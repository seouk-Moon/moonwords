import { useEffect, useRef, useState } from "react";

export function WordPronunciationButton({ word, onPlayed }: { word: string; onPlayed?: () => void }) {
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const [error, setError] = useState("");
  const supported = typeof window !== "undefined" && Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === "function";

  useEffect(() => () => {
    if (current.current) {
      current.current = null;
      window.speechSynthesis.cancel();
    }
  }, [word]);

  const play = () => {
    if (!supported || !word.trim()) return;
    setError("");
    current.current = null;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.trim());
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    const voices = window.speechSynthesis.getVoices().filter((voice) => /^en(?:-|_)/i.test(voice.lang));
    utterance.voice = voices.find((voice) => /^en[-_]US$/i.test(voice.lang)) ?? voices[0] ?? null;
    if (utterance.voice) utterance.lang = utterance.voice.lang;
    current.current = utterance;
    utterance.onend = () => { if (current.current === utterance) current.current = null; };
    utterance.onerror = (event) => {
      if (current.current !== utterance) return;
      current.current = null;
      if (event.error !== "canceled" && event.error !== "interrupted") setError("발음을 재생하지 못했어요. 기기의 영어 음성 설정을 확인하고 다시 눌러 주세요.");
    };
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
      onPlayed?.();
    } catch {
      current.current = null;
      setError("발음을 재생하지 못했어요. 다시 눌러 주세요.");
    }
  };

  return <span className="word-pronunciation"><button type="button" disabled={!supported || !word.trim()} title={supported ? "현재 단어의 영어 발음 듣기" : "이 브라우저에서는 음성 재생을 지원하지 않아요."} aria-label="현재 단어 영어 발음 듣기" onClick={play}>🔊 듣기</button>{error && <small role="status">{error}</small>}</span>;
}
