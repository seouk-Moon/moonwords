import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MoonDrive } from "./MoonDrive";
import "./standalone.css";

createRoot(document.getElementById("root")!).render(<StrictMode>
  <div className="drive-page">
    <header className="drive-page-header"><a className="drive-brand" href="./drive.html">Moon Drive</a><a href="./">MoonWords로 이동 ↗</a></header>
    <main>
      <div className="drive-page-intro"><p>YOUR FILES, YOUR SPACE</p><h1>필요한 파일을<br/>한곳에 보관하세요.</h1><p>6자리 코드로 열고, 원본 그대로 올리고 내려받는 파일 보관함.</p></div>
      <MoonDrive />
    </main>
    <footer className="drive-page-footer">© 2026 Moon Drive · 파일 보관 서비스</footer>
  </div>
</StrictMode>);
