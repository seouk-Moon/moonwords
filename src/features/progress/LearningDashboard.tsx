import type { LearningAnalyticsSnapshot } from "./learning-analytics";

const signed = (value: number, suffix = "") => value === 0 ? `0${suffix}` : `${value > 0 ? "+" : ""}${value}${suffix}`;
const delta = (current: number, previous: number) => current - previous;
const accuracyTone = (value: number) => value >= 85 ? "great" : value >= 70 ? "good" : "steady";

export function LearningDashboard({ analytics }: { analytics: LearningAnalyticsSnapshot }) {
  const sentenceGoal = 5;
  const quizGoal = 10;
  const sentenceProgress = Math.min(100, Math.round((analytics.today.sentencesStudied / sentenceGoal) * 100));
  const quizProgress = Math.min(100, Math.round((analytics.today.quizAnswers / quizGoal) * 100));
  const todayProgress = Math.round((sentenceProgress + quizProgress) / 2);
  const accuracyChange = delta(analytics.weekly.accuracy, analytics.previousWeek.accuracy);
  const questionChange = delta(analytics.weekly.quizAnswers, analytics.previousWeek.quizAnswers);
  const studyDayChange = delta(analytics.weekly.studyDays, analytics.previousWeek.studyDays);

  return (
    <section className="growth-dashboard" aria-label="학습 성장 기록">
      {!analytics.storageReady && (
        <div className="analytics-setup-warning">
          <b>학습 기록 저장 설정이 아직 연결되지 않았어요.</b>
          <span>ZIP의 SUPABASE_LEARNING_SETUP.sql을 Supabase SQL Editor에서 한 번 실행하면 기록이 기기 밖에서도 계속 누적돼요.</span>
        </div>
      )}

      <div className="growth-hero-grid">
        <article className="streak-card">
          <div className="moon-stage" aria-hidden="true">{analytics.moon.icon}</div>
          <div>
            <span className="growth-kicker">STREAK</span>
            <h2>{analytics.currentStreak}일 연속 학습</h2>
            <p>{analytics.moon.name} · {analytics.moon.nextLabel}</p>
            <small>주간 기록은 월요일에 새로 시작하지만 연속 학습은 계속 이어져요.</small>
          </div>
        </article>

        <article className="level-card">
          <div className="level-number"><span>LV</span><strong>{analytics.level}</strong></div>
          <div className="level-copy">
            <span className="growth-kicker">TOTAL XP</span>
            <h3>{analytics.totalXp.toLocaleString()} XP</h3>
            <div className="level-progress"><i style={{ width: `${(analytics.levelXp / 500) * 100}%` }} /></div>
            <small>다음 레벨까지 {analytics.xpToNextLevel} XP</small>
          </div>
        </article>

        <article className="today-goal-card">
          <header><div><span className="growth-kicker">TODAY</span><h3>오늘의 학습 목표</h3></div><strong>{todayProgress}%</strong></header>
          <div className="goal-row"><span>본문 문장</span><b>{analytics.today.sentencesStudied}/{sentenceGoal}</b><div><i style={{ width: `${sentenceProgress}%` }} /></div></div>
          <div className="goal-row"><span>퀴즈</span><b>{analytics.today.quizAnswers}/{quizGoal}</b><div><i style={{ width: `${quizProgress}%` }} /></div></div>
          <small>연속 학습 인정: 퀴즈 5문제 또는 본문 5문장</small>
        </article>
      </div>

      <article className="week-card">
        <header>
          <div><span className="growth-kicker">THIS WEEK</span><h3>이번 주 학습</h3></div>
          <span>매주 월요일 00:00 새 주 시작</span>
        </header>
        <div className="week-days">
          {analytics.currentWeek.map((day) => (
            <div key={day.dateKey} className={`${day.qualified ? "qualified" : ""} ${day.dateKey === analytics.today.dateKey ? "today" : ""}`}>
              <span>{day.weekday}</span>
              <b>{day.qualified ? "●" : day.hasActivity ? "◐" : "○"}</b>
              <small>{day.label}</small>
            </div>
          ))}
        </div>
        <div className="week-summary-grid">
          <div><span>학습일</span><strong>{analytics.weekly.studyDays}<small>/7일</small></strong></div>
          <div><span>푼 문제</span><strong>{analytics.weekly.quizAnswers}<small>문제</small></strong></div>
          <div><span>정답률</span><strong>{analytics.weekly.accuracy}<small>%</small></strong></div>
          <div><span>학습시간</span><strong>{analytics.weekly.minutes}<small>분</small></strong></div>
          <div><span>이번 주 XP</span><strong>{analytics.weekly.xp}<small>XP</small></strong></div>
        </div>
      </article>

      <div className="growth-detail-grid">
        <article className="growth-panel weekly-growth-panel">
          <header><div><span className="growth-kicker">WEEKLY REPORT</span><h3>지난주보다</h3></div></header>
          <div className="growth-comparison-list">
            <div><span>정답률</span><b className={accuracyChange >= 0 ? "up" : "down"}>{signed(accuracyChange, "%p")}</b><small>{analytics.previousWeek.accuracy}% → {analytics.weekly.accuracy}%</small></div>
            <div><span>문제 수</span><b className={questionChange >= 0 ? "up" : "down"}>{signed(questionChange)}</b><small>{analytics.previousWeek.quizAnswers} → {analytics.weekly.quizAnswers}</small></div>
            <div><span>학습일</span><b className={studyDayChange >= 0 ? "up" : "down"}>{signed(studyDayChange, "일")}</b><small>{analytics.previousWeek.studyDays}일 → {analytics.weekly.studyDays}일</small></div>
          </div>
        </article>

        <article className="growth-panel mode-accuracy-panel">
          <header><div><span className="growth-kicker">SKILLS</span><h3>분야별 정답률</h3></div></header>
          <div className="mode-stat-list">
            {analytics.modeStats.map((stat) => (
              <div key={stat.mode}>
                <div><span>{stat.label}</span><b>{stat.answered ? `${stat.accuracy}%` : "—"}</b></div>
                <div className={`mode-bar ${accuracyTone(stat.accuracy)}`}><i style={{ width: `${stat.answered ? stat.accuracy : 0}%` }} /></div>
                <small>{stat.answered ? `${stat.answered}문제` : "아직 기록 없음"}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="growth-panel recent-chart-panel">
          <header><div><span className="growth-kicker">7 DAYS</span><h3>최근 7일 정답률</h3></div></header>
          <div className="mini-chart">
            {analytics.recentDays.map((day) => (
              <div key={day.dateKey} className={day.dateKey === analytics.today.dateKey ? "today" : ""}>
                <span className="mini-bar-wrap"><i style={{ height: `${day.quizAnswers ? Math.max(8, day.accuracy) : 2}%` }} /></span>
                <b>{day.quizAnswers ? `${day.accuracy}%` : "·"}</b>
                <small>{day.weekday}</small>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="growth-bottom-grid">
        <article className="growth-panel achievement-panel">
          <header><div><span className="growth-kicker">ACHIEVEMENTS</span><h3>나의 업적</h3></div><span>{analytics.unlockedAchievements}/{analytics.achievements.length} 달성</span></header>
          <div className="achievement-grid">
            {analytics.achievements.map((achievement) => (
              <div key={achievement.id} className={achievement.unlocked ? "unlocked" : "locked"}>
                <span className="achievement-icon">{achievement.icon}</span>
                <div><b>{achievement.title}</b><small>{achievement.description}</small><span>{achievement.unlocked ? "달성 완료" : `${achievement.progress}/${achievement.target}`}</span></div>
              </div>
            ))}
          </div>
        </article>

        <article className="growth-panel records-panel">
          <header><div><span className="growth-kicker">RECORDS</span><h3>개인 최고 기록</h3></div></header>
          <div className="record-list">
            <div><span>🔥</span><div><small>최장 연속 학습</small><b>{analytics.personalBest.longestStreak}일</b></div></div>
            <div><span>✓</span><div><small>하루 최고 문제</small><b>{analytics.personalBest.dailyQuestions}문제</b></div></div>
            <div><span>✦</span><div><small>주간 최고 XP</small><b>{analytics.personalBest.weeklyXp} XP</b></div></div>
            <div><span>⏱</span><div><small>누적 학습시간</small><b>{analytics.totals.minutes}분</b></div></div>
          </div>
        </article>
      </div>

      <article className="growth-panel activity-history-panel">
        <header>
          <div><span className="growth-kicker">HISTORY</span><h3>최근 학습 기록</h3></div>
          <div className="lifetime-summary">
            <span>누적 {analytics.totals.quizAnswers}문제</span>
            <span>정답률 {analytics.totals.accuracy}%</span>
            <span>단어 {analytics.totals.wordsSaved}개</span>
            <span>완료 본문 {analytics.totals.documentsCompleted}개</span>
          </div>
        </header>
        <div className="activity-history-list">
          {[...analytics.recentDays].reverse().map((day) => (
            <div key={day.dateKey} className={day.hasActivity ? "has-activity" : "empty-day"}>
              <div className="history-date"><b>{day.label}</b><span>{day.weekday}요일</span></div>
              {day.hasActivity ? <>
                <div><small>학습시간</small><b>{day.minutes}분</b></div>
                <div><small>문제</small><b>{day.quizAnswers}개</b></div>
                <div><small>정답률</small><b>{day.quizAnswers ? `${day.accuracy}%` : "—"}</b></div>
                <div><small>문장</small><b>{day.sentencesStudied}개</b></div>
                <span className={day.qualified ? "streak-earned" : "streak-pending"}>{day.qualified ? "🔥 연속 학습 인정" : "조금만 더 하면 streak"}</span>
              </> : <span className="history-empty-copy">학습 기록 없음</span>}
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
