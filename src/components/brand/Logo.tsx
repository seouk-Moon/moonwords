export function Logo() {
  return (
    <div className="logo primary-logo">
      <svg className="logo-icon" viewBox="0 0 64 64" role="img" aria-label="MoonWords 달과 책 로고">
        <rect x="1" y="1" width="62" height="62" rx="16" fill="#0F1D3D" />
        <circle cx="29" cy="24" r="14" fill="#FFD166" />
        <circle cx="36" cy="18" r="13" fill="#0F1D3D" />
        <circle cx="18" cy="16" r="1.7" fill="#FFD166" />
        <path d="M18 12.5v7M14.5 16h7" stroke="#FFD166" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M49 18v8M45 22h8" stroke="#FFD166" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="45" cy="12" r="1.4" fill="#FFF4D6" />
        <path d="M11 42.5c7.4-3.3 14.3-3.1 20.8 1.1v10.2C25.1 49.9 18.2 49.7 11 53V42.5Z" fill="#FFFFFF" stroke="#DDE6F6" strokeWidth="1.2" />
        <path d="M53 42.5c-7.4-3.3-14.3-3.1-20.8 1.1v10.2C38.9 49.9 45.8 49.7 53 53V42.5Z" fill="#FFFFFF" stroke="#DDE6F6" strokeWidth="1.2" />
        <path d="M32 43.6v10.2" stroke="#0F1D3D" strokeWidth="1.5" />
        <path d="M10.5 55.7c7.8-2.2 14.9-1.8 21.5 1.5 6.6-3.3 13.7-3.7 21.5-1.5" fill="none" stroke="#FFD166" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="logo-wordmark">
        <strong>MoonWords</strong>
        <small>영어 독해와 학습의 모든 것</small>
      </span>
    </div>
  );
}
