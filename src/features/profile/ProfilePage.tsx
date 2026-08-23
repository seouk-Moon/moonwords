import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { LearningAnalyticsSnapshot } from "../progress/learning-analytics";
import { LearningDashboard } from "../progress/LearningDashboard";

type GenderValue = "" | "female" | "male" | "other" | "prefer_not_to_say";

type Props = {
  session: Session;
  analytics: LearningAnalyticsSnapshot;
  onBack: () => void;
};

const initials = (nickname: string, fullName: string, email?: string) => {
  const source = nickname.trim() || fullName.trim() || email?.split("@")[0] || "M";
  return source.slice(0, 2).toUpperCase();
};

export function ProfilePage({ session, analytics, onBack }: Props) {
  const metadata = session.user.user_metadata ?? {};
  const [fullName, setFullName] = useState(String(metadata.full_name ?? ""));
  const [nickname, setNickname] = useState(String(metadata.nickname ?? ""));
  const [gender, setGender] = useState<GenderValue>((metadata.gender as GenderValue | undefined) ?? "");
  const [avatarUrl, setAvatarUrl] = useState(String(metadata.avatar_url ?? ""));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const next = session.user.user_metadata ?? {};
    setFullName(String(next.full_name ?? ""));
    setNickname(String(next.nickname ?? ""));
    setGender((next.gender as GenderValue | undefined) ?? "");
    setAvatarUrl(String(next.avatar_url ?? ""));
  }, [session.user]);

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

  const uploadAvatar = async (file: File) => {
    if (!supabase) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일을 선택해 주세요.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("프로필 사진은 5MB 이하로 올려 주세요.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    const path = `${session.user.id}/avatar`;
    const uploadResult = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });
    if (uploadResult.error) {
      setUploading(false);
      setError(uploadResult.error.message.includes("Bucket not found")
        ? "프로필 사진 저장소가 아직 없어요. ZIP의 SUPABASE_PROFILE_SETUP.sql을 Supabase SQL Editor에서 한 번 실행해 주세요."
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
          <div className="profile-avatar-large" aria-label={`${displayName} 프로필 사진`}>
            {avatarUrl ? <img src={avatarUrl} alt="프로필" /> : <span>{initials(nickname, fullName, session.user.email)}</span>}
          </div>
          <div className="profile-identity-copy">
            <span className="section-kicker">ACCOUNT</span>
            <h2>{displayName}</h2>
            <p>{session.user.email}</p>
            <label className="avatar-upload-button">
              {uploading ? "사진 올리는 중…" : "프로필 사진 변경"}
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <small>JPG, PNG 등 이미지 · 최대 5MB</small>
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
            <label>이메일<input value={session.user.email ?? ""} disabled /></label>
          </div>
          {error && <p className="profile-form-error">{error}</p>}
          {message && <p className="profile-form-message">{message}</p>}
          <button className="primary-button profile-save-button" disabled={saving} onClick={() => void saveProfile()}>
            {saving ? "저장 중…" : "프로필 저장"}
          </button>
        </article>
      </section>

      <section className="profile-analytics-head">
        <div>
          <span className="eyebrow">LEARNING RECORD</span>
          <h2>내 학습 현황</h2>
          <p>첫 화면 대신 프로필에서 필요할 때만 확인할 수 있어요.</p>
        </div>
      </section>
      <LearningDashboard analytics={analytics} />
    </main>
  );
}
