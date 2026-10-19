import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearLocalSupabaseAuthSession, supabase } from '../lib/supabase';
import { describeDevice, readSessionId } from '../lib/device-session-utils';

// SDK clears in-memory auth and broadcasts sign-out to sibling tabs. If Auth
// is unreachable, remove persisted credentials and reload to drop memory too.
export async function signOutThisBrowser() {
  if (!supabase) return;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (!error) return;
  } catch { /* clear a stale/offline local session below */ }
  clearLocalSupabaseAuthSession();
  window.location.reload();
}

export function useDeviceSession(session: Session | null) {
  const sessionId = session ? readSessionId(session.access_token) : '';
  const [checkedSession, setCheckedSession] = useState('');
  const userId = session?.user.id ?? '';

  useEffect(() => {
    const client = supabase;
    if (!client || !sessionId) return;
    let active = true;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const { data, error } = await client.rpc('moonwords_touch_session', {
          p_device_name: describeDevice(navigator.userAgent),
        });
        if (!active) return;
        // Missing migration/offline must not break existing logins.
        if (!error && data === false) {
          // Do not sign out an account that changed while this request ran.
          const current = await client.auth.getSession();
          if (active && readSessionId(current.data.session?.access_token ?? '') === sessionId) {
            await signOutThisBrowser();
          }
          return;
        }
      } catch { /* retry on next foreground check */ }
      finally {
        busy = false;
        if (active) setCheckedSession(sessionId);
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [sessionId, userId]);

  return { checking: Boolean(sessionId && checkedSession !== sessionId) };
}
