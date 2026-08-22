import type { Metadata } from "next";
import "./globals.css";
import "../src/styles/modern-study.css";

export const metadata: Metadata = {
  other: { "codex-preview": "development" },
  metadataBase: new URL(
    "https://spacex-english-lab.yeongnam2026tshs.chatgpt.site",
  ),
  title: "MoonWords · AI English Studio",
  description:
    "어떤 영어 본문도 문장별 번역, 문맥 단어장, 듣기와 퀴즈가 있는 나만의 AI 학습지로 만드세요.",
  openGraph: {
    title: "MoonWords · AI English Studio",
    description: "내가 올린 영어 본문으로 완성되는 AI 학습실",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1730,
        height: 909,
        alt: "MoonWords AI English Studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MoonWords · AI English Studio",
    description: "내가 올린 영어 본문으로 완성되는 AI 학습실",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
