import type { Session } from "@supabase/supabase-js";
import type { View } from "../../app-types";
import { Logo } from "../brand/Logo";

type Props = {
  view: View;
  hasCurrent: boolean;
  configured: boolean;
  session: Session | null;
  onView: (view: View) => void;
  onSignOut: () => void;
};

const documentNavItems: Array<{ view: "study" | "words" | "quiz"; label: string }> = [
  { view: "study", label: "본문 학습" },
  { view: "words", label: "단어장" },
  { view: "quiz", label: "퀴즈" },
];

const getDisplayName = (session: Session | null) => {
  if (!session) return "샘플 학습";
  const metadata = session.user.user_metadata ?? {};
  return String(metadata.nickname || metadata.full_name || session.user.email?.split("@")[0] || "내 프로필");
};

const getInitials = (session: Session | null) => getDisplayName(session).slice(0, 2).toUpperCase();

export function AppHeader({ view, hasCurrent, configured, session, onView, onSignOut }: Props) {
  const inDocumentWorkspace = hasCurrent && (view === "study" || view === "words" || view === "quiz");
  const avatarUrl = String(session?.user.user_metadata?.avatar_url ?? "");

  return (
    <header className="topbar">
      <button className="brand-button" onClick={() => onView("library")} aria-label="MoonWords 내 본문">
        <Logo />
      </button>

      {inDocumentWorkspace && (
        <button className="library-return-button" onClick={() => onView("library")}>← 내 본문</button>
      )}

      {inDocumentWorkspace && (
        <nav aria-label="현재 본문 학습 메뉴">
          {documentNavItems.map((item) => (
            <button
              key={item.view}
              className={view === item.view ? "active" : ""}
              onClick={() => onView(item.view)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <div className="account-area">
        {!configured && <span className="demo-badge">DEMO</span>}
        {session ? (
          <button className={`profile-trigger ${view === "profile" ? "active" : ""}`} onClick={() => onView("profile")} aria-label="내 프로필 열기">
            <span className="profile-trigger-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : getInitials(session)}
            </span>
            <span className="profile-trigger-copy"><b>{getDisplayName(session)}</b><small>내 프로필</small></span>
          </button>
        ) : <span className="account-email">샘플 학습</span>}
        {session && <button className="signout-button" onClick={onSignOut}>로그아웃</button>}
      </div>
    </header>
  );
}
