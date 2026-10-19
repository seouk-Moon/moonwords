import { useEffect, useRef, useState } from 'react';
import { MoonCharacter } from './MoonCharacter';
import './moon-growth.css';

export function MoonRewardToast({ userId, dateKey, complete, ready, streak }: {
  userId: string;
  dateKey: string;
  complete: boolean;
  ready: boolean;
  streak: number;
}) {
  const previous = useRef<{ userId: string; dateKey: string; complete: boolean } | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) { previous.current = null; return; }
    const last = previous.current;
    previous.current = { userId, dateKey, complete };
    if (!last || last.userId !== userId || last.dateKey !== dateKey) { setVisible(false); return; }
    if (!complete || last.complete) return;
    const key = `moonwords:moon-celebrated:${userId}:${dateKey}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch { /* animation also works when storage is blocked */ }
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 5500);
  }, [userId, dateKey, complete, ready]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!visible) return null;
  return <aside className="moon-reward-toast" aria-label="오늘 미션 완료 축하">
    <div className="moon-reward-art" aria-hidden="true"><MoonCharacter light={1} joyful /><span>✦</span></div>
    <div role="status"><b>오늘의 달빛을 모았어요!</b><p>{streak}일 연속 학습 · 달이 한 뼘 자랐어요.</p></div>
    <button type="button" aria-label="축하 알림 닫기" onClick={() => setVisible(false)}>×</button>
  </aside>;
}
