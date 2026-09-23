import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { clearLocalSupabaseAuthSession, supabase } from "../../lib/supabase";
import type { DailyGoalSettings, LearningAnalyticsSnapshot } from "../progress/learning-analytics";
import { LearningDashboard } from "../progress/LearningDashboard";

type GenderValue = "" | "female" | "male" | "other" | "prefer_not_to_say";

type Props = {
  session: Session;
  analytics: LearningAnalyticsSnapshot;
  goals: DailyGoalSettings;
  onGoalsChange: (next: DailyGoalSettings) => void;
  onBack: () => void;
};

const initials = (nickname: string, fullName: string, email?: string) => {
  const source = nickname.trim() || fullName.trim() || email?.split("@")[0] || "M";
  return source.slice(0, 2).toUpperCase();
};

const cropAvatar = (file: File, x: number, y: number, zoom: number) => new Promise<Blob>((resolve, reject) => {
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) { URL.revokeObjectURL(url); reject(new Error("사진을 편집하지 못했습니다.")); return; }
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const offsetX = -(width - size) * (x / 100);
    const offsetY = -(height - size) * (y / 100);
    context.drawImage(image, offsetX, offsetY, width, height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("사진을 저장할 수 없습니다.")), "image/jpeg", 0.9);
  };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("사진을 읽지 못했습니다.")); };
  image.src = url;
});

export function ProfilePage({ session, analytics, goals, onGoalsChange, onBack }: Props) {
  const metadata = session.user.user_metadata ?? {};
  const [fullName, setFullName] = useState(String(metadata.full_name ?? ""));
  const [nickname, setNickname] = useState(String(metadata.nickname ?? ""));
  const [gender, setGender] = useState<GenderValue>((metadata.gender as GenderValue | undefined) ?? "");
  const [avatarUrl, setAvatarUrl] = useState(String(metadata.avatar_url ?? ""));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [securityEmail, setSecurityEmail] = useState(session.user.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [securitySaving, setSecuritySaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);

  useEffect(() => {
    const next = session.user.user_metadata ?? {};
    setFullName(String(next.full_name ?? ""));
    setNickname(String(next.nickname ?? ""));
    setGender((next.gender as GenderValue | undefined) ?? "");
    setAvatarUrl(String(next.avatar_url ?? ""));
    setSecurityEmail(session.user.email ?? "");
  }, [session.user]);

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  const displayName = useMemo(
    () => nickname.trim() || fullName.trim() || session.user.email?.split("@")[0] || "MoonWords 사용자",
    [fullName, nickname, session.user.email],
  );

  const saveProfile = async () => {
    if (!supabase) return;
    if (!fullName.trim() || !nickname.trim()) {
      setError("본명과 닉네임을 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...session.user.user_metadata,
        full_name: fullName.trim(),
        nickname: nickname.trim(),
        gender,
      },
    });
    setSaving(false);
    if (updateError) setError(updateError.message);
    else setMessage("프로필 정보를 저장했어요.");
  };

  const signOutEverywhere = async () => {
    if (!supabase || signingOutEverywhere) return;
    const confirmed = window.confirm("이 기기를 포함해 MoonWords에 로그인된 모든 기기에서 로그아웃할까요?");
    if (!confirmed) return;

    setSigningOutEverywhere(true);
    setError("");
    setMessage("");

    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
      if (!signOutError) return;

      const sessionMissing =
        signOutError.name === "AuthSessionMissingError" ||
        /auth session missing/i.test(signOutError.message);

      if (sessionMissing) {
        // The server has already invalidated this browser's session, while an old
        // copy can still remain in localStorage. Clear that stale copy so the UI
        // cannot remain stuck in a false "logged in" state.
        clearLocalSupabaseAuthSession();
        window.alert(
          "현재 기기의 로그인 세션은 이미 만료되어 있어요. 이 기기의 오래된 로그인 정보는 정리했습니다. 다른 기기 세션까지 확실히 끊으려면 다시 로그인한 뒤 ‘모든 기기 로그아웃’을 한 번 더 눌러 주세요.",
        );
        window.location.reload();
        return;
      }

      setSigningOutEverywhere(false);
      setError(`모든 기기 로그아웃 중 문제가 생겼어요: ${signOutError.message}`);
    } catch (signOutError) {
      setSigningOutEverywhere(false);
      setError(
        `모든 기기 로그아웃 중 문제가 생겼어요: ${
          signOutError instanceof Error ? signOutError.message : "알 수 없는 오류"
        }`,
      );
    }
  };

  const uploadAvatar = async (file: Blob) => {
    if (!supabase) return;
    setUploading(true);
    setError("");
    setMessage("");
    const path = `${session.user.id}/avatar`;
    const uploadResult = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      contentType: "image/jpeg",
      upsert: true,
    });
    if (uploadResult.error) {
      setUploading(false);
      setError(uploadResult.error.message.includes("Bucket not found")
        ? "프로필 사진을 저장할 수 없어요. 잠시 뒤 다시 시도해 주세요."
        : uploadResult.error.message);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const nextAvatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...session.user.user_metadata,
        avatar_path: path,
        avatar_url: nextAvatarUrl,
      },
    });
    setUploading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAvatarUrl(nextAvatarUrl);
    setMessage("프로필 사진을 바꿨어요.");
  };

  const chooseAvatar = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("이미지 파일을 선택해 주세요."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("프로필 사진은 5MB 이하로 올려 주세요."); return; }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setCropX(50); setCropY(50); setCropZoom(1); setError("");
  };

  const saveCroppedAvatar = async () => {
    if (!avatarFile) return;
    try {
      const blob = await cropAvatar(avatarFile, cropX, cropY, cropZoom);
      await uploadAvatar(blob);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview("");
      setAvatarFile(null);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "사진을 편집하지 못했습니다.");
    }
  };

  const updateEmail = async () => {
    if (!supabase || !securityEmail.trim()) return;
    setSecuritySaving(true); setError(""); setMessage("");
    const { error: updateError } = await supabase.auth.updateUser({ email: securityEmail.trim() });
    setSecuritySaving(false);
    if (updateError) setError(updateError.message);
    else setMessage("이메일 변경 요청을 저장했어요. 확인 메일이 오면 안내에 따라 완료해 주세요.");
  };

  const updatePassword = async () => {
    if (!supabase || newPassword.length < 8) { setError("새 비밀번호는 8자 이상 입력해 주세요."); return; }
    setSecuritySaving(true); setError(""); setMessage("");
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSecuritySaving(false);
    if (updateError) setError(updateError.message);
    else { setNewPassword(""); setMessage("비밀번호를 변경했어요."); }
  };

  return (
    <main className="profile-page">
      <section className="profile-heading">
        <div>
          <button className="profile-back" onClick={onBack}>← 내 본문으로</button>
          <span className="eyebrow">MY PROFILE</span>
          <h1>프로필</h1>
          <p>계정 정보와 학습 기록을 한곳에서 확인하고 관리할 수 있어요.</p>
        </div>
      </section>

      <section className="profile-card-grid">
        <article className="profile-card profile-identity-card">
          <label className="profile-avatar-picker" aria-label={`${displayName} 프로필 사진 변경`}>
            <span className="profile-avatar-large">{avatarUrl ? <img src={avatarUrl} alt="프로필" /> : <span>{initials(nickname, fullName, session.user.email)}</span>}<i>사진 변경</i></span>
            <input type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseAvatar(file); event.currentTarget.value = ""; }} />
          </label>
          <div className="profile-identity-copy">
            <span className="section-kicker">ACCOUNT</span>
            <h2>{displayName}</h2>
            <p>{session.user.email}</p>
            <small>사진을 누르면 표시할 위치를 직접 고를 수 있어요.</small>
          </div>
        </article>

        <article className="profile-card profile-form-card">
          <span className="section-kicker">PROFILE INFO</span>
          <h2>기본 정보</h2>
          <div className="profile-form-grid">
            <label>본명<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="본명" /></label>
            <label>닉네임<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="앱에서 사용할 이름" /></label>
            <label>성별
              <select value={gender} onChange={(event) => setGender(event.target.value as GenderValue)}>
                <option value="">선택 안 함</option>
                <option value="female">여성</option>
                <option value="male">남성</option>
                <option value="other">기타</option>
                <option value="prefer_not_to_say">밝히고 싶지 않음</option>
              </select>
            </label>
          </div>
          {error && <p className="profile-form-error">{error}</p>}
          {message && <p className="profile-form-message">{message}</p>}
          <button className="primary-button profile-save-button" disabled={saving} onClick={() => void saveProfile()}>
            {saving ? "저장 중…" : "프로필 저장"}
          </button>

          <div className="profile-security-block account-security-editor">
            <div className="security-editor-copy"><span className="section-kicker">SECURITY</span><b>계정 보안</b></div>
            <div className="security-editor-fields">
              <label>이메일<input type="email" value={securityEmail} onChange={(event) => setSecurityEmail(event.target.value)} /><button type="button" disabled={securitySaving || securityEmail.trim() === (session.user.email ?? "")} onClick={() => void updateEmail()}>이메일 변경</button></label>
              <label>새 비밀번호<input type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="8자 이상" /><button type="button" disabled={securitySaving || newPassword.length < 8} onClick={() => void updatePassword()}>비밀번호 변경</button></label>
            </div>
            <button className="profile-global-signout-button" type="button" disabled={signingOutEverywhere} onClick={() => void signOutEverywhere()}>{signingOutEverywhere ? "로그아웃 중…" : "모든 기기 로그아웃"}</button>
          </div>
        </article>
      </section>

      <section className="profile-analytics-head">
        <div>
          <span className="eyebrow">LEARNING RECORD</span>
          <h2>내 학습 현황</h2>
        </div>
      </section>
      <LearningDashboard analytics={analytics} goals={goals} onGoalsChange={onGoalsChange} />
      {avatarPreview && <>
        <button className="avatar-crop-backdrop" aria-label="사진 편집 닫기" onClick={() => { URL.revokeObjectURL(avatarPreview); setAvatarPreview(""); setAvatarFile(null); }} />
        <section className="avatar-crop-modal" role="dialog" aria-modal="true" aria-label="프로필 사진 위치 선택">
          <header><div><span className="section-kicker">PROFILE PHOTO</span><h2>사진 위치 선택</h2></div><button type="button" onClick={() => { URL.revokeObjectURL(avatarPreview); setAvatarPreview(""); setAvatarFile(null); }}>×</button></header>
          <div className="avatar-crop-preview"><img src={avatarPreview} alt="프로필 사진 미리보기" style={{ objectPosition: `${cropX}% ${cropY}%`, transform: `scale(${cropZoom})` }} /></div>
          <label>좌우 위치<input type="range" min="0" max="100" value={cropX} onChange={(event) => setCropX(Number(event.target.value))} /></label>
          <label>위아래 위치<input type="range" min="0" max="100" value={cropY} onChange={(event) => setCropY(Number(event.target.value))} /></label>
          <label>확대<input type="range" min="1" max="2.5" step="0.05" value={cropZoom} onChange={(event) => setCropZoom(Number(event.target.value))} /></label>
          <button type="button" className="primary-button" disabled={uploading} onClick={() => void saveCroppedAvatar()}>{uploading ? "저장 중…" : "이 위치로 저장"}</button>
        </section>
      </>}
    </main>
  );
}
