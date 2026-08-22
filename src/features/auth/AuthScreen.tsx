import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { Logo } from "../../components/brand/Logo";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup") setMessage("인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
  };

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Logo />
        <p className="eyebrow">YOUR READING, YOUR WORDS</p>
        <h1>어떤 영어 본문도<br />나만의 학습지로.</h1>
        <p>파일이나 텍스트를 올리면 Gemini가 문장별 번역, 단어 뜻, 본문 구조와 퀴즈를 만들고 계정에 안전하게 저장합니다.</p>
        <div className="feature-row"><span>PDF · DOCX · TXT</span><span>나만의 단어장</span><span>맞춤 퀴즈</span></div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <span className="section-kicker">{mode === "login" ? "WELCOME BACK" : "START LEARNING"}</span>
        <h2>{mode === "login" ? "내 학습실 열기" : "계정 만들기"}</h2>
        <label>이메일<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" /></label>
        <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="6자 이상" /></label>
        {message && <p className="form-message">{message}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}</button>
        <button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? "처음인가요? 계정 만들기" : "이미 계정이 있나요? 로그인"}
        </button>
      </form>
    </main>
  );
}

