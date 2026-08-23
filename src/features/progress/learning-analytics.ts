import type { LearningEvent, LearningSession, QuizAttempt } from "../../types";
import type { QuizMode } from "../../app-types";

export type DailyLearningStat = {
  dateKey: string;
  label: string;
  weekday: string;
  quizAnswers: number;
  correctAnswers: number;
  accuracy: number;
  sentencesStudied: number;
  wordsSaved: number;
  xp: number;
  minutes: number;
  qualified: boolean;
  hasActivity: boolean;
};

export type QuizModeStat = {
  mode: QuizMode;
  label: string;
  answered: number;
  correct: number;
  accuracy: number;
};

export type AchievementItem = {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
};

export type LearningAnalyticsSnapshot = {
  storageReady: boolean;
  totalXp: number;
  level: number;
  levelXp: number;
  xpToNextLevel: number;
  currentStreak: number;
  longestStreak: number;
  moon: { icon: string; name: string; nextLabel: string };
  today: DailyLearningStat;
  currentWeek: DailyLearningStat[];
  recentDays: DailyLearningStat[];
  weekly: {
    quizAnswers: number;
    correctAnswers: number;
    accuracy: number;
    sentencesStudied: number;
    wordsSaved: number;
    xp: number;
    minutes: number;
    studyDays: number;
  };
  previousWeek: {
    quizAnswers: number;
    correctAnswers: number;
    accuracy: number;
    sentencesStudied: number;
    wordsSaved: number;
    xp: number;
    minutes: number;
    studyDays: number;
  };
  modeStats: QuizModeStat[];
  achievements: AchievementItem[];
  unlockedAchievements: number;
  personalBest: {
    dailyQuestions: number;
    weeklyXp: number;
    longestStreak: number;
  };
  totals: {
    quizAnswers: number;
    correctAnswers: number;
    accuracy: number;
    sentencesStudied: number;
    wordsSaved: number;
    documentsCompleted: number;
    minutes: number;
    quizSessions: number;
  };
};

const quizModeLabels: Record<QuizMode, string> = {
  comprehension: "본문 이해",
  meaning: "단어 뜻",
  flashcard: "플래시카드",
  cloze: "빈칸 완성",
  ordering: "어순 배열",
};

const pad = (value: number) => String(value).padStart(2, "0");

export const localDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const dateFromKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeek = (date: Date) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
};

const percent = (correct: number, total: number) => total ? Math.round((correct / total) * 100) : 0;

const createEmptyDay = (date: Date): DailyLearningStat => ({
  dateKey: localDateKey(date),
  label: `${date.getMonth() + 1}/${date.getDate()}`,
  weekday: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
  quizAnswers: 0,
  correctAnswers: 0,
  accuracy: 0,
  sentencesStudied: 0,
  wordsSaved: 0,
  xp: 0,
  minutes: 0,
  qualified: false,
  hasActivity: false,
});

const getMoonPhase = (streak: number) => {
  if (streak <= 0) return { icon: "🌑", name: "새로운 시작", nextLabel: "오늘 학습하면 초승달이 떠요" };
  if (streak <= 2) return { icon: "🌒", name: "가는 초승달", nextLabel: `${3 - streak}일 뒤 초승달` };
  if (streak <= 6) return { icon: "🌙", name: "초승달", nextLabel: `${7 - streak}일 뒤 반달` };
  if (streak <= 13) return { icon: "🌓", name: "반달", nextLabel: `${14 - streak}일 뒤 차오르는 달` };
  if (streak <= 20) return { icon: "🌔", name: "차오르는 달", nextLabel: `${21 - streak}일 뒤 보름달` };
  return { icon: "🌕", name: "보름달", nextLabel: "연속 학습을 계속 이어가세요" };
};

const summarizeRange = (days: DailyLearningStat[]) => {
  const quizAnswers = days.reduce((sum, day) => sum + day.quizAnswers, 0);
  const correctAnswers = days.reduce((sum, day) => sum + day.correctAnswers, 0);
  return {
    quizAnswers,
    correctAnswers,
    accuracy: percent(correctAnswers, quizAnswers),
    sentencesStudied: days.reduce((sum, day) => sum + day.sentencesStudied, 0),
    wordsSaved: days.reduce((sum, day) => sum + day.wordsSaved, 0),
    xp: days.reduce((sum, day) => sum + day.xp, 0),
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    studyDays: days.filter((day) => day.hasActivity).length,
  };
};

export function buildLearningAnalytics({
  events,
  sessions,
  quizAttempts,
  storageReady,
  vocabularyCount = 0,
  completedDocumentCount = 0,
  now = new Date(),
}: {
  events: LearningEvent[];
  sessions: LearningSession[];
  quizAttempts: QuizAttempt[];
  storageReady: boolean;
  vocabularyCount?: number;
  completedDocumentCount?: number;
  now?: Date;
}): LearningAnalyticsSnapshot {
  const dayMap = new Map<string, DailyLearningStat & { sentenceKeys: Set<string> }>();
  const getDay = (key: string) => {
    const existing = dayMap.get(key);
    if (existing) return existing;
    const created = { ...createEmptyDay(dateFromKey(key)), sentenceKeys: new Set<string>() };
    dayMap.set(key, created);
    return created;
  };

  for (const event of events) {
    const date = new Date(event.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = getDay(localDateKey(date));
    day.hasActivity = true;
    day.xp += event.xp ?? 0;
    if (event.event_type === "quiz_answer") {
      day.quizAnswers += 1;
      if (event.is_correct) day.correctAnswers += 1;
    }
    if (event.event_type === "sentence_studied") {
      const sentenceKey = `${event.document_id ?? "none"}:${event.sentence_id ?? "none"}`;
      day.sentenceKeys.add(sentenceKey);
    }
    if (event.event_type === "word_saved") day.wordsSaved += 1;
  }

  for (const session of sessions) {
    const date = new Date(session.started_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = getDay(localDateKey(date));
    const seconds = Math.max(0, session.active_seconds ?? 0);
    // Opening the quiz screen (including waiting for AI generation) is not a solved problem.
    // A quiz-only session is counted only on a day that has at least one actual quiz answer.
    if (session.view === "quiz" && day.quizAnswers === 0) continue;
    if (seconds > 0) day.hasActivity = true;
    day.minutes += seconds / 60;
  }

  for (const day of dayMap.values()) {
    day.sentencesStudied = day.sentenceKeys.size;
    day.accuracy = percent(day.correctAnswers, day.quizAnswers);
    day.qualified = day.quizAnswers >= 5 || day.sentencesStudied >= 5;
  }

  const allDays = [...dayMap.values()].map(({ sentenceKeys: _sentenceKeys, ...day }) => ({ ...day, minutes: Math.round(day.minutes) }));
  const qualifiedKeys = new Set(allDays.filter((day) => day.qualified).map((day) => day.dateKey));
  const todayKey = localDateKey(now);
  let cursor = qualifiedKeys.has(todayKey) ? new Date(now) : addDays(new Date(now), -1);
  let currentStreak = 0;
  while (qualifiedKeys.has(localDateKey(cursor))) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const sortedQualified = [...qualifiedKeys].sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: Date | null = null;
  for (const key of sortedQualified) {
    const date = dateFromKey(key);
    if (previousDate && Math.round((date.getTime() - previousDate.getTime()) / 86400000) === 1) runningStreak += 1;
    else runningStreak = 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previousDate = date;
  }

  const weekStart = startOfWeek(now);
  const currentWeek = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return allDays.find((day) => day.dateKey === localDateKey(date)) ?? createEmptyDay(date);
  });
  const previousWeekStart = addDays(weekStart, -7);
  const previousWeek = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(previousWeekStart, index);
    return allDays.find((day) => day.dateKey === localDateKey(date)) ?? createEmptyDay(date);
  });
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(now, index - 6);
    return allDays.find((day) => day.dateKey === localDateKey(date)) ?? createEmptyDay(date);
  });

  const today = allDays.find((day) => day.dateKey === todayKey) ?? createEmptyDay(now);
  const weekly = summarizeRange(currentWeek);
  const previousWeekSummary = summarizeRange(previousWeek);

  const quizEvents = events.filter((event) => event.event_type === "quiz_answer");
  const modeStats = (Object.keys(quizModeLabels) as QuizMode[]).map((mode) => {
    const items = quizEvents.filter((event) => event.quiz_mode === mode);
    const correct = items.filter((event) => event.is_correct).length;
    return { mode, label: quizModeLabels[mode], answered: items.length, correct, accuracy: percent(correct, items.length) };
  });

  const totalXp = events.reduce((sum, event) => sum + (event.xp ?? 0), 0);
  const levelSize = 500;
  const level = Math.floor(totalXp / levelSize) + 1;
  const levelXp = totalXp % levelSize;
  const totals = {
    quizAnswers: quizEvents.length,
    correctAnswers: quizEvents.filter((event) => event.is_correct).length,
    accuracy: percent(quizEvents.filter((event) => event.is_correct).length, quizEvents.length),
    sentencesStudied: events.filter((event) => event.event_type === "sentence_studied").length,
    wordsSaved: Math.max(vocabularyCount, events.filter((event) => event.event_type === "word_saved").length),
    documentsCompleted: Math.max(completedDocumentCount, new Set(events.filter((event) => event.event_type === "document_completed").map((event) => event.document_id).filter(Boolean)).size),
    minutes: sessions.reduce((sum, session) => sum + Math.round(Math.max(0, session.active_seconds ?? 0) / 60), 0),
    quizSessions: quizAttempts.length,
  };

  const hasNinetySession = quizAttempts.some((attempt) => attempt.question_count >= 10 && attempt.score / Math.max(1, attempt.question_count) >= 0.9);
  const achievementData: Array<Omit<AchievementItem, "unlocked" | "progress"> & { current: number }> = [
    { id: "first-quiz", title: "첫 발자국", description: "첫 퀴즈 문제 풀기", icon: "✦", current: totals.quizAnswers, target: 1 },
    { id: "first-reading", title: "첫 완독", description: "본문 1개 학습 완료", icon: "📖", current: totals.documentsCompleted, target: 1 },
    { id: "streak-7", title: "반달", description: "7일 연속 학습", icon: "🌓", current: longestStreak, target: 7 },
    { id: "streak-21", title: "보름달", description: "21일 연속 학습", icon: "🌕", current: longestStreak, target: 21 },
    { id: "quiz-100", title: "100문제", description: "퀴즈 100문제 풀기", icon: "💯", current: totals.quizAnswers, target: 100 },
    { id: "quiz-500", title: "Recall Master", description: "퀴즈 500문제 풀기", icon: "🏅", current: totals.quizAnswers, target: 500 },
    { id: "words-100", title: "Word Collector", description: "단어 100개 저장", icon: "🔖", current: totals.wordsSaved, target: 100 },
    { id: "accuracy-90", title: "Sharp Mind", description: "10문제 이상 퀴즈에서 90% 달성", icon: "🎯", current: hasNinetySession ? 1 : 0, target: 1 },
  ];
  const achievements = achievementData.map(({ current, ...item }) => ({
    ...item,
    unlocked: current >= item.target,
    progress: Math.min(current, item.target),
  }));

  const dailyQuestions = Math.max(0, ...allDays.map((day) => day.quizAnswers));
  const weeklyXpMap = new Map<string, number>();
  for (const event of events) {
    const date = new Date(event.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = localDateKey(startOfWeek(date));
    weeklyXpMap.set(key, (weeklyXpMap.get(key) ?? 0) + (event.xp ?? 0));
  }

  return {
    storageReady,
    totalXp,
    level,
    levelXp,
    xpToNextLevel: levelSize - levelXp,
    currentStreak,
    longestStreak,
    moon: getMoonPhase(currentStreak),
    today,
    currentWeek,
    recentDays,
    weekly,
    previousWeek: previousWeekSummary,
    modeStats,
    achievements,
    unlockedAchievements: achievements.filter((achievement) => achievement.unlocked).length,
    personalBest: {
      dailyQuestions,
      weeklyXp: Math.max(0, ...weeklyXpMap.values()),
      longestStreak,
    },
    totals,
  };
}
