type ListeningState = "idle" | "playing" | "paused";

type Props = {
  state: ListeningState;
  currentSentenceIndex: number;
  sentenceCount: number;
  onPrimary: () => void;
  onStop: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  floating?: boolean;
};

export function ListeningControls({
  state,
  currentSentenceIndex,
  sentenceCount,
  onPrimary,
  onStop,
  onSeekBackward,
  onSeekForward,
  floating = false,
}: Props) {
  const primaryLabel = state === "idle"
    ? "▶ 전체 듣기"
    : state === "paused"
      ? "▶ 계속 듣기"
      : "Ⅱ 일시정지";

  const status = state === "idle"
    ? "영어 본문 연속 재생"
    : currentSentenceIndex > 0
      ? `${currentSentenceIndex}/${sentenceCount} 문장 · ${state === "paused" ? "일시정지" : "재생 중"}`
      : state === "paused"
        ? "일시정지"
        : "재생 준비 중";

  return (
    <div
      className={`${floating ? "audio-bottom-dock" : "audio-toolbar"} ${state === "playing" ? "is-playing" : ""} ${state === "paused" ? "is-paused" : ""}`}
      aria-label={floating ? "본문 하단 듣기 컨트롤" : "본문 듣기 컨트롤"}
    >
      <div>
        {floating && state !== "idle" && onSeekBackward && (
          <button className="audio-seek" type="button" onClick={onSeekBackward} aria-label="5초 전으로 이동">
            ↶ 5초
          </button>
        )}
        <button
          className="audio-play"
          type="button"
          onClick={onPrimary}
          aria-pressed={state !== "idle"}
        >
          {primaryLabel}
        </button>
        {floating && state !== "idle" && onSeekForward && (
          <button className="audio-seek" type="button" onClick={onSeekForward} aria-label="5초 후로 이동">
            5초 ↷
          </button>
        )}
        {state !== "idle" && <button type="button" onClick={onStop}>■ 정지</button>}
        <span aria-live="polite">{status}</span>
      </div>
    </div>
  );
}
