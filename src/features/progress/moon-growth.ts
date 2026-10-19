import type { DailyGoalSettings, DailyLearningStat } from './learning-analytics';

export const MOON_STAGES = [
  { days: 0, name: '잠든 달', light: 0.06 },
  { days: 1, name: '첫 초승달', light: 0.16 },
  { days: 3, name: '자라는 초승달', light: 0.28 },
  { days: 7, name: '반달', light: 0.5 },
  { days: 14, name: '차오르는 달', light: 0.78 },
  { days: 21, name: '보름달', light: 1 },
] as const;

export function dailyMissionProgress(day: DailyLearningStat, goals: DailyGoalSettings) {
  const keys = ['fullListeningDocuments', 'flashcardDocuments', 'quizDocuments'] as const;
  const active = keys.filter(key => goals[key] > 0);
  if (!active.length) return day.qualified ? 100 : 0;
  return Math.round(active.reduce((sum, key) => sum + Math.min(1, Math.max(0, day[key]) / goals[key]), 0) / active.length * 100);
}

export function moonGrowth(completedDays: number, todayProgress: number, todayComplete: boolean) {
  const days = Math.max(0, Math.floor(completedDays));
  // A completed day is already in the total. Preview only an unfinished day.
  const previewDays = days + (todayComplete ? 0 : Math.min(0.99, Math.max(0, todayProgress) / 100));
  const stage = [...MOON_STAGES].reverse().find(item => days >= item.days) ?? MOON_STAGES[0];
  const next = MOON_STAGES.find(item => item.days > days) ?? null;
  const fraction = next ? Math.min(1, (previewDays - stage.days) / (next.days - stage.days)) : 1;
  const light = next ? stage.light + (next.light - stage.light) * fraction : 1;
  return { days, stage, next, light, percent: Math.min(100, Math.round(previewDays / 21 * 100)) };
}

/** Lit right hemisphere plus an elliptical terminator; 0=new, 1=full. */
export function moonLightPath(light: number) {
  const fraction = Math.min(1, Math.max(0.001, light));
  const radius = Math.max(0.001, Math.abs(1 - 2 * fraction) * 76);
  return `M 100 24 A 76 76 0 0 1 100 176 A ${radius.toFixed(3)} 76 0 0 ${fraction >= 0.5 ? 1 : 0} 100 24 Z`;
}
