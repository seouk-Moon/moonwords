import { useEffect } from "react";
import type { QuizGenerationJob } from "../../app-types";

type Props = {
  job: QuizGenerationJob;
  onStop: () => void;
  onOpen: () => void;
  onDismiss: () => void;
};

export function GenerationToast({ job, onStop, onOpen, onDismiss }: Props) {
  useEffect(() => {
    if (job.status !== "cancelled") return;
    const timer = window.setTimeout(onDismiss, 3500);
    return () => window.clearTimeout(timer);
  }, [job.id, job.status, onDismiss]);

  const title = job.status === "running"
    ? "문제 생성 중"
    : job.status === "success"
      ? "문제 생성 완료"
      : job.status === "cancelled"
        ? "생성 중단"
        : "생성 실패";

  return (
    <aside className={`generation-toast ${job.status}`} role="status">
      <i />
      <div><b>{title}</b><p>{job.message}</p></div>
      {job.status === "running" ? (
        <button className="stop-generation" onClick={onStop}>중단</button>
      ) : (
        <div className="toast-actions">
          {job.status === "success" && <button onClick={onOpen}>퀴즈 열기</button>}
          <button onClick={onDismiss}>닫기</button>
        </div>
      )}
    </aside>
  );
}
