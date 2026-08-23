import type { View } from "../../app-types";
import { AppIcon } from "../ui/AppIcon";

type Props = {
  view: View;
  hasCurrent: boolean;
  onView: (view: View) => void;
};

const items: Array<{ view: "study" | "words" | "quiz"; label: string; icon: "study" | "words" | "quiz" }> = [
  { view: "study", label: "본문 학습", icon: "study" },
  { view: "words", label: "단어장", icon: "words" },
  { view: "quiz", label: "퀴즈", icon: "quiz" },
];

export function MobileBottomNav({ view, hasCurrent, onView }: Props) {
  if (!hasCurrent || view === "library" || view === "upload" || view === "profile") return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="현재 본문 학습 메뉴">
      {items.map((item) => (
        <button
          key={item.view}
          className={view === item.view ? "active" : ""}
          onClick={() => onView(item.view)}
        >
          <span className="mobile-nav-icon" aria-hidden="true"><AppIcon name={item.icon} size={20} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
