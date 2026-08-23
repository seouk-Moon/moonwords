import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { Logo } from "../../components/brand/Logo";

type GenderValue = "" | "female" | "male" | "other" | "prefer_not_to_say";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<GenderValue>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (mode === "signup" && (!fullName.trim() || !nickname.trim())) {
      setMessage("본명과 닉네임을 모두 입력해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              nickname: nickname.trim(),
              gender,
            },
          },
        });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup") setMessage("가입 정보가 저장됐어요. 인증 메일의 링크를 누른 뒤 로그인해 주세요. 프로필 사진은 로그인 후 프로필에서 설정할 수 있어요.");
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
      <form className={`auth-card ${mode === "signup" ? "signup-card" : ""}`} onSubmit={submit}>
        <span className="section-kicker">{mode === "login" ? "WELCOME BACK" : "START LEARNING"}</span>
        <h2>{mode === "login" ? "내 학습실 열기" : "계정 만들기"}</h2>
        {mode === "signup" && <div className="signup-profile-fields">
          <label>본명<input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="본명" autoComplete="name" /></label>
          <label>닉네임<input value={nickname} onChange={(e) => setNickname(e.target.value)} required placeholder="MoonWords에서 사용할 이름" /></label>
          <label>성별
            <select value={gender} onChange={(e) => setGender(e.target.value as GenderValue)}>
              <option value="">선택 안 함</option>
              <option value="female">여성</option>
              <option value="male">남성</option>
              <option value="other">기타</option>
              <option value="prefer_not_to_say">밝히고 싶지 않음</option>
            </select>
          </label>
        </div>}
        <label>이메일<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" /></label>
        <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="6자 이상" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {mode === "signup" && <p className="signup-photo-note">프로필 사진은 가입 후 상단 프로필 버튼에서 설정할 수 있어요.</p>}
        {message && <p className="form-message">{message}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}</button>
        <button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? "처음인가요? 계정 만들기" : "이미 계정이 있나요? 로그인"}
        </button>
      </form>
    </main>
  );
}
