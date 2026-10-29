import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { withAccountDeadline } from '../../lib/account-session';
import { isAutoLoginEnabled } from '../../lib/auth-storage';
import { signOutThisBrowser } from '../../hooks/useDeviceSession';
import { DeviceSessions } from '../profile/DeviceSessions';
import './account.css';

export function AccountSettings({ session }: { session: Session }) {
  const meta = session.user.user_metadata ?? {};
  const [fullName, setFullName] = useState(String(meta.full_name ?? ''));
  const [nickname, setNickname] = useState(String(meta.nickname ?? ''));
  const [gender, setGender] = useState(String(meta.gender ?? ''));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setFullName(String(meta.full_name ?? ''));
    setNickname(String(meta.nickname ?? ''));
    setGender(String(meta.gender ?? ''));
  }, [session.user]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    if (!fullName.trim() || !nickname.trim()) { setError('본명과 닉네임을 입력해 주세요.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await withAccountDeadline(supabase.auth.updateUser({ data: {
        full_name: fullName.trim(), nickname: nickname.trim(), gender,
      }}));
      if (result.error) throw result.error;
      setMessage('통합 계정 정보를 저장했어요. 모든 서비스에 같은 정보가 적용됩니다.');
    } catch (err) { setError(err instanceof Error ? err.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <main className="moons-account-settings">
    <div className="moons-account-intro"><small>ONE ACCOUNT · ALL SERVICES</small><h1>통합 계정 설정</h1><p>MOONS의 모든 서비스에서 사용하는 계정이에요. 기존 MoonWords 계정과 자료도 그대로 유지됩니다.</p></div>
    <section className="moons-account-card"><h2>계정 정보</h2><dl><dt>이메일</dt><dd>{session.user.email}</dd><dt>계정</dt><dd>MOONS 통합 계정</dd><dt>이 브라우저의 로그인 유지</dt><dd>{isAutoLoginEnabled() ? '자동 로그인 사용 중' : '현재 탭에서만 유지'}</dd></dl><p>로그인 유지 방식은 로그인할 때 ‘자동 로그인’에서 선택할 수 있어요.</p></section>
    <form className="moons-account-card" onSubmit={event => void save(event)}><h2>내 프로필</h2><label>본명<input value={fullName} onChange={event=>setFullName(event.target.value)} autoComplete="name" maxLength={100} required disabled={busy}/></label><label>닉네임<input value={nickname} onChange={event=>setNickname(event.target.value)} maxLength={60} required disabled={busy}/></label><label>성별<select value={gender} onChange={event=>setGender(event.target.value)} disabled={busy}><option value="">선택 안 함</option><option value="female">여성</option><option value="male">남성</option><option value="other">기타</option><option value="prefer_not_to_say">밝히고 싶지 않음</option></select></label>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<button className="primary-button" disabled={busy}>{busy?'저장 중…':'통합 프로필 저장'}</button></form>
    <DeviceSessions key={session.user.id}/>
    <section className="moons-account-card"><h2>로그아웃</h2><p>이 브라우저의 모든 MOONS 서비스에서 로그아웃합니다.</p><button type="button" onClick={()=>void signOutThisBrowser()}>이 브라우저 로그아웃</button></section>
  </main>;
}
