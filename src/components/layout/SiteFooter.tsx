export type InfoPage = "service" | "terms" | "privacy" | "contact";

export function SiteFooter({ onOpen }: { onOpen: (page: InfoPage) => void }) {
  const openPage = (page: InfoPage) => { onOpen(page); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <b>MoonWords</b>
          <p>영어 본문을 읽고, 단어를 익히고, 퀴즈로 복습하는 나만의 학습 공간.</p>
        </div>
        <nav aria-label="서비스 안내">
          <div><strong>서비스</strong><button onClick={() => openPage("service")}>본문 학습</button><button onClick={() => openPage("service")}>단어장</button><button onClick={() => openPage("service")}>퀴즈</button><button onClick={() => openPage("service")}>학습 기록</button></div>
          <div><strong>안내</strong><button onClick={() => openPage("contact")}>문의하기</button><a href="https://github.com/seouk-Moon/moonwords" target="_blank" rel="noreferrer">GitHub</a></div>
          <div><strong>법적 안내</strong><button onClick={() => openPage("terms")}>이용약관</button><button onClick={() => openPage("privacy")}>개인정보처리방침</button></div>
        </nav>
      </div>
      <div className="site-footer-bottom">
        <span>© 2026 MoonWords</span>
        <div><button onClick={() => openPage("service")}>서비스</button><button onClick={() => openPage("terms")}>이용약관</button><button onClick={() => openPage("privacy")}>개인정보처리방침</button><button onClick={() => openPage("contact")}>문의하기</button></div>
      </div>
    </footer>
  );
}
