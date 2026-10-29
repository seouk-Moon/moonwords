import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { verifiedAccountSession } from '../../lib/account-session';
import { AuthScreen } from '../auth/AuthScreen';
import { AccountSettings } from './AccountSettings';
import { signOutThisBrowser, useDeviceSession } from '../../hooks/useDeviceSession';
import '../../../app/globals.css';
import '../../styles/modern-study.css';

const params = new URLSearchParams(location.search);
const bridge = params.get('bridge') === '1' && parent !== window;
const settings = params.get('mode') === 'settings';
function returnPath() {
  try {
    const url = new URL(params.get('return') || '/', location.origin);
    if (url.origin !== location.origin || url.pathname.endsWith('/account.html')) return '/';
    ['access_token','refresh_token','code','token_hash','provider_token','provider_refresh_token'].forEach(key => url.searchParams.delete(key));
    return url.pathname + url.search;
  } catch { return '/'; }
}

function Account() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const device = useDeviceSession(session);
  const requestId = useRef(0);
  const verify = useCallback(async () => {
    const id = ++requestId.current;
    setReady(false);
    setError('');
    if (!supabase) {
      setError('MoonWords의 Supabase 연결 설정을 확인해 주세요.');
      setReady(true);
      return;
    }
    try {
      const next = await verifiedAccountSession(supabase);
      if (id !== requestId.current) return;
      setSession(next);
      setReady(true);
      setRevision(n => n + 1);
      window.dispatchEvent(new Event('moons-check-session'));
    } catch (err) {
      if (id !== requestId.current) return;
      setSession(null);
      setError(err instanceof Error ? err.message : '계정 연결을 확인하지 못했어요. 다시 시도해 주세요.');
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Do not call an Auth method inside an SDK auth callback (it holds its lock).
    const sub = supabase?.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'USER_UPDATED' && next) { setSession(next); return; }
      ++requestId.current;
      setReady(false);
      clearTimeout(timer);
      timer = setTimeout(() => void verify(), 0);
    });
    void verify();
    const listener = (event: MessageEvent) => {
      if (!bridge || event.origin !== location.origin || event.source !== parent) return;
      if (event.data?.type === 'moons-signout') void signOutThisBrowser();
      if (event.data?.type === 'moons-auth-check') void verify();
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void verify(); };
    window.addEventListener('message', listener);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      ++requestId.current;
      clearTimeout(timer);
      sub?.data.subscription.unsubscribe();
      window.removeEventListener('message', listener);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [verify]);

  useEffect(() => {
    if (!ready || device.checking) return;
    if (bridge) {
      parent.postMessage({type:'moons-auth', state:error?'error':session?'signed-in':'signed-out', userId:session?.user.id??null, name:session?.user.user_metadata?.nickname||'MOONS 회원', message:error}, location.origin);
    } else if (session && !error && !settings) location.replace(returnPath());
  }, [session, ready, error, device.checking, revision]);

  if (bridge) return null;
  return <><header className="moons-account-header"><a href="/" aria-label="MOONS 홈">☾ MOONS · 통합 계정</a></header>{error?<section style={{padding:24}}><p role="alert">{error}</p><button className="primary-button" onClick={() => void verify()}>다시 확인하기</button></section>:!ready||device.checking?<p style={{padding:24}}>계정을 확인하는 중…</p>:!session?<AuthScreen/>:settings?<AccountSettings session={session}/>:<p style={{padding:24}}>MOONS로 이동하는 중…</p>}</>;
}
createRoot(document.getElementById('root')!).render(<Account/>);
