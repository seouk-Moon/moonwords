/** Labels describe the browser, not a hardware identity; no fingerprinting. */
export function describeDevice(userAgent: string) {
  const os = /Android/i.test(userAgent) ? 'Android' : /iPad/i.test(userAgent) ? 'iPad'
    : /iPhone/i.test(userAgent) ? 'iPhone' : /Windows/i.test(userAgent) ? 'Windows'
    : /Macintosh|Mac OS X/i.test(userAgent) ? 'Mac / iPad' : /Linux/i.test(userAgent) ? 'Linux' : '기기';
  const browser = /SamsungBrowser/i.test(userAgent) ? '삼성 인터넷' : /Edg\//i.test(userAgent) ? 'Edge'
    : /Firefox|FxiOS/i.test(userAgent) ? 'Firefox' : /Chrome|CriOS/i.test(userAgent) ? 'Chrome'
    : /Safari/i.test(userAgent) ? 'Safari' : '브라우저';
  return `${os} · ${browser}`;
}

export function readSessionId(accessToken: string) {
  try {
    const part = accessToken.split('.')[1];
    const encoded = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return typeof payload.session_id === 'string' ? payload.session_id : '';
  } catch { return ''; }
}

export function sessionErrorMessage(error: { message: string; code?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883' || /schema cache|could not find the function/i.test(error.message)) {
    return '로그인 기기 관리 설정이 아직 적용되지 않았어요. 제공된 Supabase SQL을 먼저 실행해 주세요.';
  }
  return `기기 정보를 처리하지 못했어요. ${error.message}`;
}
