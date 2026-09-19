type ListeningState = "idle" | "playing" | "paused";
type PlaybackIconName = "play" | "pause" | "stop";

export function PlaybackIcon({ name }: { name: PlaybackIconName }) {
  return (
    <svg className="playback-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {name === "play" && <path d="M6.5 4.4v11.2L15 10 6.5 4.4Z" fill="currentColor" />}
      {name === "pause" && <><rect x="5" y="4.5" width="3.5" height="11" rx="1" fill="currentColor" /><rect x="11.5" y="4.5" width="3.5" height="11" rx="1" fill="currentColor" /></>}
      {name === "stop" && <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" />}
    </svg>
  );
}

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
    ? "전체 듣기"
    : state === "paused"
      ? "계속 듣기"
      : "일시정지";

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
          <PlaybackIcon name={state === "playing" ? "pause" : "play"} />
          {primaryLabel}
        </button>
        {floating && state !== "idle" && onSeekForward && (
          <button className="audio-seek" type="button" onClick={onSeekForward} aria-label="5초 후로 이동">
            5초 ↷
          </button>
        )}
        {state !== "idle" && <button type="button" onClick={onStop}><PlaybackIcon name="stop" />정지</button>}
        <span aria-live="polite">{status}</span>
      </div>
    </div>
  );
}
