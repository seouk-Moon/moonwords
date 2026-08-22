import type { SVGProps } from "react";

type IconName = "library" | "study" | "words" | "quiz";

type Props = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export function AppIcon({ name, size = 20, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {name === "library" && <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.8V21h13V9.8"/><path d="M9.5 21v-6.5h5V21"/></>}
      {name === "study" && <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22Z"/></>}
      {name === "words" && <path d="M6 3h12v19l-6-4-6 4Z"/>}
      {name === "quiz" && <><circle cx="12" cy="12" r="9"/><path d="m8.7 12 2.1 2.1 4.7-5"/></>}
    </svg>
  );
}
