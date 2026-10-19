import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sessionErrorMessage } from '../../lib/device-session-utils';
import { signOutThisBrowser } from '../../hooks/useDeviceSession';
import './device-sessions.css';

type DeviceSession = {
  session_id: string;
  device_name: string;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
};

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '확인할 수 없음' : date.toLocaleString('ko-KR');
};

export function DeviceSessions() {
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const working = useRef(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const result = await supabase.rpc('moonwords_list_sessions');
      if (!mounted.current) return;
      if (result.error) setError(sessionErrorMessage(result.error));
      else setDevices((result.data ?? []) as DeviceSession[]);
    } catch {
      if (mounted.current) setError('기기 목록을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    } finally { if (mounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const revoke = async (device: DeviceSession) => {
    if (!supabase || working.current) return;
    if (!window.confirm(`${device.is_current ? '현재 브라우저' : device.device_name}에서 로그아웃할까요?`)) return;
    working.current = true;
    setBusy(device.session_id);
    setError(''); setMessage('');
    try {
      const result = await supabase.rpc('moonwords_revoke_sessions', { p_session_id: device.session_id });
      if (!mounted.current) return;
      if (result.error) { setError(sessionErrorMessage(result.error)); return; }
      if (device.is_current) { await signOutThisBrowser(); return; }
      setMessage('선택한 로그인을 해제했어요. 접속 중인 앱은 다음 확인 시 로그인 화면으로 이동합니다.');
      await load();
    } catch {
      if (mounted.current) setError('로그아웃 결과를 확인하지 못했어요. 목록을 새로고침한 뒤 다시 확인해 주세요.');
    } finally {
      working.current = false;
      if (mounted.current) setBusy('');
    }
  };

  return <section className="profile-card device-sessions" aria-labelledby="device-sessions-heading">
    <header>
      <div><span className="section-kicker">LOGIN DEVICES</span><h2 id="device-sessions-heading">로그인된 기기</h2></div>
      <button type="button" disabled={loading || Boolean(busy)} onClick={() => void load()}>새로고침</button>
    </header>
    <p>로그인은 브라우저·프로필별로 유지돼요. 같은 기기가 여러 번 표시될 수 있습니다.</p>
    <p className="device-sessions-note">최근 활동은 앱에서 마지막으로 확인한 시각이에요. 이전 로그인은 이 버전으로 접속하면 기기 이름이 표시됩니다.</p>
    {error && <p className="profile-form-error" role="alert">{error}</p>}
    {message && <p className="profile-form-message" role="status">{message}</p>}
    {loading ? <p role="status">기기 목록을 불러오는 중…</p> : !error && devices.length === 0 ? <p>로그인된 기기가 없습니다.</p> : null}
    <ul>{devices.map(device => <li key={device.session_id}>
      <div><strong>{device.device_name}</strong>{device.is_current && <span className="device-current">현재 접속</span>}
        <small>로그인: {dateLabel(device.created_at)}</small>
        <small>최근 활동: {dateLabel(device.last_seen_at)}</small>
      </div>
      <button type="button" disabled={loading || Boolean(busy)} onClick={() => void revoke(device)}>
        {busy === device.session_id ? '처리 중…' : device.is_current ? '이 기기 로그아웃' : '로그아웃'}
      </button>
    </li>)}</ul>
    <p className="device-sessions-note">원격 로그아웃은 앱이 켜져 있으면 약 1분 이내, 다시 열면 접속 확인 후 반영돼요. 이미 발급된 접근 권한은 만료 전까지 유효할 수 있습니다.</p>
  </section>;
}
