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

export function AppHeader({ view, hasCurrent, configured, session, onView, onSignOut }: Props) {
  const inDocumentWorkspace = hasCurrent && (view === "study" || view === "words" || view === "quiz");

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
        <span className="account-email">{session?.user.email ?? "샘플 학습"}</span>
        {session && <button onClick={onSignOut}>로그아웃</button>}
      </div>
    </header>
  );
}
