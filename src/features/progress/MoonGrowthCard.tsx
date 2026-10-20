import { useEffect, useRef, useState } from 'react';
import type { DailyGoalSettings, LearningAnalyticsSnapshot } from './learning-analytics';
import { dailyMissionProgress, moonGrowth, MOON_STAGES } from './moon-growth';
import { MoonCharacter } from './MoonCharacter';
import './moon-growth.css';

export function MoonGrowthCard({ analytics, goals, ready, onOpenProfile }: {
  analytics: LearningAnalyticsSnapshot;
  goals: DailyGoalSettings;
  ready: boolean;
  onOpenProfile?: () => void;
}) {
  const [reacting, setReacting] = useState(false);
  const [reactionCount,setReactionCount] = useState(0);
  const greetings = ["함께 빛나자! ✦", "또 만나서 좋아! ☾", "네 달빛을 모으고 있어! ✨", "한 번 더, 반짝! ✦"];
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); }, []);
  const progress = dailyMissionProgress(analytics.today, goals);
  const growth = moonGrowth(analytics.totalMissionDays, progress, analytics.today.qualified);
  const pending = !ready;
  const sayHello = () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setReacting(true);
    setReactionCount(count=>count+1);
    reactionTimer.current = setTimeout(() => setReacting(false), 1800);
  };
  const heading = pending ? '너의 달을 불러오는 중' : analytics.today.qualified ? '오늘도 한 뼘, 더 빛나게.'
    : analytics.currentStreak > 0 ? '오늘도 우리, 이어서 빛나자.' : growth.days > 0 ? '다시 만나서 반가워.' : '작은 공부가, 달을 키워요.';

  return <section className={`moon-growth-card ${analytics.today.qualified ? 'today-complete' : ''} ${reacting ? 'moon-reacting' : ''}`} aria-label="나의 달 성장과 연속 학습" aria-busy={pending}>
    <div className="moon-sky-stars" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
    <div className="moon-growth-copy">
      <div className="moon-card-eyebrow"><span>MY LITTLE MOON</span><span className={`moon-streak-label ${analytics.currentStreak ? 'active' : ''}`}><span aria-hidden="true">✦</span> {pending ? '기록 확인 중' : `${analytics.currentStreak}일 연속 학습`}</span></div>
      <h2>{heading}</h2>
      <p>하루 미션을 끝내면 달이 조금씩 차올라요.<br />쉬어 간 날에도, 함께 키운 달은 남아 있어요.</p>
      <div className="moon-today-heading"><span>{analytics.today.qualified ? '✓ 오늘의 달빛을 모았어요' : '오늘 모은 달빛'}</span><b>{pending ? '…' : `${progress}%`}</b></div>
      <div className="moon-daily-track" role="progressbar" aria-label="오늘 미션 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${pending ? 0 : progress}%` }} /></div>
      <div className="moon-growth-footer"><span>누적 미션 <b>{pending ? '—' : growth.days}일</b><i />최고 연속 <b>{pending ? '—' : analytics.longestStreak}일</b></span>{onOpenProfile && <button type="button" onClick={onOpenProfile}>성장 기록 <span aria-hidden="true">↗</span></button>}</div>
    </div>
    <div className="moon-character-area">
      <div className="moon-orbit" aria-hidden="true"><i /></div>
      <button type="button" className="moon-touch" onClick={sayHello} aria-label="달에게 인사하기">
        <MoonCharacter key={reactionCount} light={pending ? .06 : growth.light} joyful={reacting || analytics.today.qualified} />
        <span key={reactionCount} className="moon-greeting" role="status">{reacting ? greetings[(reactionCount-1)%greetings.length] : ''}</span>
      </button>
      <div className="moon-phase-label"><span>{growth.stage.name}</span><small>{pending ? '학습 기록 확인 중' : growth.next ? `${growth.next.name}까지 미션 ${growth.next.days - growth.days}일` : '너만의 보름달을 완성했어요'}</small></div>
    </div>
    <div className="moon-milestones" aria-label="달 성장 단계">{MOON_STAGES.slice(1).map(stage => <div key={stage.days} className={!pending && growth.days >= stage.days ? 'earned' : ''}>
      <span aria-hidden="true">{!pending && growth.days >= stage.days ? '✓' : '✦'}</span><b>{stage.days}일</b><small>{stage.name}</small>
    </div>)}</div>
    {!analytics.storageReady && <p className="moon-storage-notice" role="status">학습 기록을 서버에 저장하지 못했어요. 새로고침 전에 연결 상태를 확인해 주세요.</p>}
  </section>;
}
