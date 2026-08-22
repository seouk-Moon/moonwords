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

const navItems: Array<{ view: Exclude<View, "upload">; label: string }> = [
  { view: "library", label: "내 본문" },
  { view: "study", label: "본문 학습" },
  { view: "words", label: "단어장" },
  { view: "quiz", label: "퀴즈" },
];

export function AppHeader({ view, hasCurrent, configured, session, onView, onSignOut }: Props) {
  return (
    <header className="topbar">
      <button className="brand-button" onClick={() => onView("library")} aria-label="MoonWords 홈">
        <Logo />
      </button>
      <nav aria-label="주요 메뉴">
        {navItems.map((item) => (
          <button
            key={item.view}
            className={view === item.view ? "active" : ""}
            disabled={item.view !== "library" && !hasCurrent}
            onClick={() => onView(item.view)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="account-area">
        {!configured && <span className="demo-badge">DEMO</span>}
        <span className="account-email">{session?.user.email ?? "샘플 학습"}</span>
        {session && <button onClick={onSignOut}>로그아웃</button>}
      </div>
    </header>
  );
}
