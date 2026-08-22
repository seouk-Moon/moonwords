import type { View } from "../../app-types";
import { AppIcon } from "../ui/AppIcon";

type Props = {
  view: View;
  hasCurrent: boolean;
  onView: (view: View) => void;
};

const items: Array<{ view: Exclude<View, "upload">; label: string; icon: "library" | "study" | "words" | "quiz" }> = [
  { view: "library", label: "내 본문", icon: "library" },
  { view: "study", label: "학습", icon: "study" },
  { view: "words", label: "단어장", icon: "words" },
  { view: "quiz", label: "퀴즈", icon: "quiz" },
];

export function MobileBottomNav({ view, hasCurrent, onView }: Props) {
  const activeView = view === "upload" ? "library" : view;
  return (
    <nav className="mobile-bottom-nav" aria-label="모바일 주요 메뉴">
      {items.map((item) => (
        <button
          key={item.view}
          className={activeView === item.view ? "active" : ""}
          disabled={item.view !== "library" && !hasCurrent}
          onClick={() => onView(item.view)}
        >
          <span className="mobile-nav-icon" aria-hidden="true"><AppIcon name={item.icon} size={20} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
