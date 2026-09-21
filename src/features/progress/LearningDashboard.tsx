import { useEffect, useMemo, useState } from "react";
import type { DailyGoalSettings, LearningAnalyticsSnapshot } from "./learning-analytics";

const clamp = (value: number) => Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
const progress = (value: number, goal: number) => goal <= 0 ? 100 : Math.min(100, Math.round((value / goal) * 100));
const formatStudyTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  if (safeSeconds < 60) return `${safeSeconds}초`;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
};

export function LearningDashboard({
  analytics,
  goals,
  onGoalsChange,
}: {
  analytics: LearningAnalyticsSnapshot;
  goals: DailyGoalSettings;
  onGoalsChange: (next: DailyGoalSettings) => void;
}) {
  const [showGoalSettings, setShowGoalSettings] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [draft, setDraft] = useState(goals);

  useEffect(() => setDraft(goals), [goals]);

  const missionRows = useMemo(() => [
    { key: "fullListeningDocuments" as const, label: "본문 전체 듣기", value: analytics.today.fullListeningDocuments, goal: goals.fullListeningDocuments },
    { key: "flashcardDocuments" as const, label: "플래시카드", value: analytics.today.flashcardDocuments, goal: goals.flashcardDocuments },
    { key: "quizDocuments" as const, label: "퀴즈", value: analytics.today.quizDocuments, goal: goals.quizDocuments },
  ], [analytics.today, goals]);
  const enabledRows = missionRows.filter((row) => row.goal > 0);
  const todayProgress = enabledRows.length
    ? Math.round(enabledRows.reduce((sum, row) => sum + progress(row.value, row.goal), 0) / enabledRows.length)
    : 100;

  const saveGoals = () => {
    onGoalsChange({
      fullListeningDocuments: clamp(draft.fullListeningDocuments),
      flashcardDocuments: clamp(draft.flashcardDocuments),
      quizDocuments: clamp(draft.quizDocuments),
    });
    setShowGoalSettings(false);
  };

  return (
    <section className="growth-dashboard simplified-learning-dashboard" aria-label="학습 목표와 연속 학습 기록">
      {!analytics.storageReady && (
        <div className="analytics-setup-warning">
          <b>학습 기록 저장 설정이 아직 연결되지 않았어요.</b>
          <span>SUPABASE_LEARNING_SETUP.sql을 적용하면 학습 기록을 계정에 계속 누적할 수 있어요.</span>
        </div>
      )}

      <div className="simple-learning-overview">
        <article className="mission-card">
          <header>
            <div><span className="growth-kicker">TODAY</span><h3>오늘 미션</h3></div>
            <div className="mission-card-actions"><strong>{todayProgress}%</strong><button type="button" onClick={() => setShowGoalSettings((value) => !value)} aria-expanded={showGoalSettings}>목표 설정</button></div>
          </header>
          {missionRows.map((row) => (
            <div className={`goal-row ${row.goal === 0 ? "goal-disabled" : ""}`} key={row.key}>
              <span>{row.label}</span><b>{row.goal === 0 ? "사용 안 함" : `${row.value}/${row.goal}개 본문`}</b>
              <div><i style={{ width: `${progress(row.value, row.goal)}%` }} /></div>
            </div>
          ))}
          <div className="today-study-time"><span>오늘 학습시간</span><b>{formatStudyTime(analytics.today.activeSeconds)}</b></div>

          {showGoalSettings && (
            <div className="goal-settings-panel">
              <p>하루 목표 본문 수를 정하세요. 0은 해당 목표를 끕니다.</p>
              <div className="goal-settings-grid">
                <label><span>전체 듣기</span><input type="number" min="0" max="10" value={draft.fullListeningDocuments} onChange={(event) => setDraft((current) => ({ ...current, fullListeningDocuments: clamp(Number(event.target.value)) }))} /></label>
                <label><span>플래시카드</span><input type="number" min="0" max="10" value={draft.flashcardDocuments} onChange={(event) => setDraft((current) => ({ ...current, flashcardDocuments: clamp(Number(event.target.value)) }))} /></label>
                <label><span>퀴즈</span><input type="number" min="0" max="10" value={draft.quizDocuments} onChange={(event) => setDraft((current) => ({ ...current, quizDocuments: clamp(Number(event.target.value)) }))} /></label>
              </div>
              <div className="goal-settings-buttons"><button type="button" onClick={() => { setDraft(goals); setShowGoalSettings(false); }}>취소</button><button type="button" className="primary-button" onClick={saveGoals}>저장</button></div>
            </div>
          )}
        </article>

        <article className="simple-streak-card">
          <span className="growth-kicker">STREAK</span>
          <strong>{analytics.currentStreak}<small>일</small></strong>
          <h3>연속 학습</h3>
          <p>설정한 오늘 미션을 모두 끝낸 날이 streak로 이어집니다.</p>
        </article>
      </div>

      <button type="button" className="analytics-details-toggle" onClick={() => setShowDetails((value) => !value)} aria-expanded={showDetails}>
        {showDetails ? "상세 학습 기록 닫기" : "날짜별 추이·상세 학습 기록 보기"}<span>{showDetails ? "↑" : "↓"}</span>
      </button>

      {showDetails && (
        <div className="analytics-details">
          <article className="week-card">
            <header><div><span className="growth-kicker">THIS WEEK</span><h3>이번 주</h3></div><span>월요일부터 일요일까지</span></header>
            <div className="week-days">
              {analytics.currentWeek.map((day) => (
                <div key={day.dateKey} className={`${day.qualified ? "qualified" : ""} ${day.dateKey === analytics.today.dateKey ? "today" : ""}`}>
                  <span>{day.weekday}</span><b>{day.qualified ? "●" : day.hasActivity ? "◐" : "○"}</b><small>{day.label}</small>
                </div>
              ))}
            </div>
            <div className="week-summary-grid simple-week-summary">
              <div><span>학습일</span><strong>{analytics.weekly.studyDays}<small>/7일</small></strong></div>
              <div><span>푼 문제</span><strong>{analytics.weekly.quizAnswers}<small>문제</small></strong></div>
              <div><span>정답률</span><strong>{analytics.weekly.accuracy}<small>%</small></strong></div>
              <div><span>학습시간</span><strong>{analytics.weekly.minutes}<small>분</small></strong></div>
            </div>
          </article>

          <article className="growth-panel recent-chart-panel">
            <header><div><span className="growth-kicker">7 DAYS</span><h3>최근 7일 학습 추이</h3></div></header>
            <div className="activity-history-list simple-history-list">
              {[...analytics.recentDays].reverse().map((day) => (
                <div key={day.dateKey} className={day.hasActivity ? "has-activity" : "empty-day"}>
                  <div className="history-date"><b>{day.label}</b><span>{day.weekday}요일</span></div>
                  <div><small>학습시간</small><b>{formatStudyTime(day.activeSeconds)}</b></div>
                  <div><small>전체 듣기</small><b>{day.fullListeningDocuments}개</b></div>
                  <div><small>플래시카드</small><b>{day.flashcardDocuments}개</b></div>
                  <div><small>퀴즈</small><b>{day.quizDocuments}개</b></div>
                  <span className={day.qualified ? "streak-earned" : "streak-pending"}>{day.qualified ? "미션 완료" : day.hasActivity ? "진행 중" : "기록 없음"}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
