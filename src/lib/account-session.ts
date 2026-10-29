import type { SupabaseClient } from '@supabase/supabase-js';

export class AccountConnectionError extends Error {
  constructor() { super('계정 서버 응답이 늦거나 연결되지 않았어요. 잠시 후 다시 시도해 주세요.'); }
}

// A stalled Auth request must not leave either the account page or its bridge
// waiting forever. This does not manufacture a session on timeout.
export async function withAccountDeadline<T>(request: PromiseLike<T>, ms = 12_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AccountConnectionError()), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function verifiedAccountSession(client: SupabaseClient) {
  return withAccountDeadline((async () => {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw new AccountConnectionError();
    // No credentials is a normal signed-out state, not a connection error.
    if (!session) return null;
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) {
      if (userError.status === 401 || userError.status === 403 || userError.code === 'session_not_found' || userError.code === 'refresh_token_not_found') return null;
      throw new AccountConnectionError();
    }
    return user?.id === session.user.id ? session : null;
  })());
}
