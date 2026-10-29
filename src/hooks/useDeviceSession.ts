import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearLocalSupabaseAuthSession, supabase } from '../lib/supabase';
import { describeDevice, readSessionId } from '../lib/device-session-utils';
import { withAccountDeadline } from '../lib/account-session';

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
    const check = async (force = false) => {
      if (busy || (!force && document.visibilityState === 'hidden')) return;
      busy = true;
      try {
        const { data, error } = await withAccountDeadline(client.rpc('moonwords_touch_session', {
          p_device_name: describeDevice(navigator.userAgent),
        }), 8_000);
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
    // Hidden bridge / background-tab initial checks still need to settle.
    void check(true);
    const interval = window.setInterval(() => void check(), 60_000);
    const onFocus = () => void check();
    const onAccountCheck = () => void check(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('moons-check-session', onAccountCheck);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('moons-check-session', onAccountCheck);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [sessionId, userId]);

  return { checking: Boolean(sessionId && checkedSession !== sessionId) };
}
