import type { InfoPage } from "../../components/layout/SiteFooter";

const effectiveDate = "2026년 8월 23일";

export function LegalPage({ page, onBack }: { page: InfoPage; onBack: () => void }) {
  const title = page === "service" ? "서비스" : page === "terms" ? "이용약관" : page === "privacy" ? "개인정보처리방침" : "문의하기";
  return (
    <main className="legal-page">
      <button className="legal-back" onClick={onBack}>← MoonWords로 돌아가기</button>
      <header>
        <span className="eyebrow">MOONWORDS · SERVICE INFO</span>
        <h1>{title}</h1>
        {page !== "contact" && page !== "service" && <p>시행일: {effectiveDate}</p>}
      </header>
      {page === "service" ? <Service /> : page === "terms" ? <Terms /> : page === "privacy" ? <Privacy /> : <Contact />}
    </main>
  );
}

function Service() {
  return <article className="legal-card service-info-card">
    <section><h2>본문 학습</h2><p>PDF, DOCX, TXT 또는 직접 입력한 영어 본문을 문장별로 읽고 번역, 듣기, 이해 체크, 어려운 문장 체크를 사용할 수 있습니다. 필요할 때는 학습 화면 위에서 원래 업로드한 원문도 함께 확인할 수 있습니다.</p></section>
    <section><h2>단어장</h2><p>본문에서 모르는 단어를 선택해 뜻을 확인하고 저장할 수 있으며, 저장한 단어를 복습하고 최근 퀴즈 결과를 바탕으로 학습 상태를 확인할 수 있습니다.</p></section>
    <section><h2>퀴즈</h2><p>단어 뜻, 빈칸, 어순 배열, 독해 문제 등 여러 방식으로 본문을 복습할 수 있습니다. 기존 본문 학습 메뉴를 유지하면서 언제든 다른 메뉴로 이동할 수 있습니다.</p></section>
    <section><h2>학습 기록</h2><p>연속 학습일, 정답률, 문제 풀이 수, 학습 시간과 최근 활동 기록은 로그인 후 상단 프로필 버튼에서 확인할 수 있습니다.</p></section>
    <section><h2>프로필</h2><p>가입 시 본명, 닉네임과 성별을 설정할 수 있고, 로그인 후 프로필 화면에서 정보를 수정하거나 프로필 사진을 등록할 수 있습니다.</p></section>
  </article>;
}

function Terms() {
  return <article className="legal-card">
    <section><h2>1. 목적</h2><p>이 약관은 MoonWords가 제공하는 영어 학습 서비스의 이용 조건과 사용자 및 서비스 운영자 사이의 기본적인 권리·의무를 정하는 것을 목적으로 합니다.</p></section>
    <section><h2>2. 서비스 내용</h2><p>MoonWords는 사용자가 등록한 영어 본문을 바탕으로 문장 학습, 단어장, 퀴즈, 학습 기록 및 AI를 활용한 분석·문제 생성 기능 등을 제공합니다. 서비스의 세부 기능은 개선 과정에서 추가·변경될 수 있습니다.</p></section>
    <section><h2>3. 계정과 이용</h2><p>사용자는 본인의 계정 정보를 정확하게 관리해야 하며 계정을 제3자에게 부정하게 이용하게 해서는 안 됩니다. 다른 사람의 권리를 침해하거나 서비스 운영을 방해하는 방식으로 서비스를 이용할 수 없습니다.</p></section>
    <section><h2>4. 사용자가 등록한 콘텐츠</h2><p>사용자가 업로드하거나 입력한 본문, 메모 등 콘텐츠에 대한 권리는 원칙적으로 사용자 또는 원 권리자에게 있습니다. 사용자는 해당 콘텐츠를 서비스에서 처리할 수 있는 적법한 권한을 보유해야 합니다. MoonWords는 학습 기능 제공에 필요한 범위에서만 콘텐츠를 저장·분석·처리합니다.</p></section>
    <section><h2>5. AI 생성 결과</h2><p>번역, 단어 뜻, 분석, 퀴즈 등 AI가 생성한 결과에는 오류가 있을 수 있습니다. 중요한 학업·업무 판단에는 원문이나 신뢰할 수 있는 자료를 함께 확인해 주세요.</p></section>
    <section><h2>6. 서비스 변경 및 중단</h2><p>보안, 유지보수, 외부 서비스 장애 또는 기능 개선을 위해 서비스 일부가 변경되거나 일시 중단될 수 있습니다. 가능한 경우 서비스 내 안내를 통해 중요한 변경 사항을 알립니다.</p></section>
    <section><h2>7. 책임의 범위</h2><p>MoonWords는 관련 법령이 허용하는 범위에서 무료 또는 시험 운영 기능, AI 생성 결과, 사용자의 부적절한 이용 및 통제할 수 없는 외부 서비스 장애로 발생한 손해에 대해 책임이 제한될 수 있습니다.</p></section>
    <section><h2>8. 약관의 변경</h2><p>서비스 구조나 관련 법령이 바뀌면 약관을 수정할 수 있으며 중요한 변경은 서비스 화면 등을 통해 사전에 안내하도록 노력합니다.</p></section>
    <section><h2>9. 문의</h2><p>서비스 이용과 관련한 문의는 MoonWords의 문의하기 페이지에 안내된 채널을 이용해 주세요.</p></section>
  </article>;
}

function Privacy() {
  return <article className="legal-card">
    <section><h2>1. 처리하는 정보</h2><p>MoonWords는 기능 제공 과정에서 이메일 기반 계정 정보, 사용자가 설정한 본명·닉네임·성별·프로필 사진, 사용자가 등록한 본문과 분석 결과, 저장한 단어, 문장 학습 상태, 퀴즈 응답 및 학습 기록을 처리할 수 있습니다. 서비스 운영 환경에서는 접속·오류 관련 기술 정보가 인프라 제공자에 의해 처리될 수 있습니다.</p></section>
    <section><h2>2. 이용 목적</h2><p>정보는 로그인 및 계정 유지, 본문·단어장 저장, 학습 진도 동기화, 퀴즈 채점과 통계 제공, 서비스 안정성 및 오류 개선을 위해 사용합니다.</p></section>
    <section><h2>3. 외부 서비스 이용</h2><p>MoonWords는 인증과 데이터 저장을 위해 Supabase를 사용하며, AI 분석이나 문제 생성 기능을 사용할 때에는 서버 측 기능을 통해 Google Gemini 계열 AI 서비스로 필요한 본문 일부가 전달될 수 있습니다. 외부 서비스의 처리는 각 제공자의 정책과 계약 조건의 적용을 받을 수 있습니다.</p></section>
    <section><h2>4. 보관과 삭제</h2><p>계정 및 학습 데이터는 서비스 제공에 필요한 기간 동안 보관하며, 사용자가 데이터를 직접 삭제하거나 계정·데이터 삭제를 요청하는 경우 관련 법령상 보관 의무가 없는 범위에서 삭제할 수 있습니다. 백업 또는 장애 복구용 사본은 제한된 기간 동안 남을 수 있습니다.</p></section>
    <section><h2>5. 사용자의 선택과 권리</h2><p>사용자는 서비스에서 본문, 단어 및 일부 학습 정보를 관리할 수 있으며, 자신의 정보에 대한 확인·정정·삭제 관련 문의를 할 수 있습니다. 민감한 개인정보는 공개 GitHub 이슈에 작성하지 마세요.</p></section>
    <section><h2>6. 보안</h2><p>MoonWords는 브라우저에 비밀 AI API 키를 노출하지 않도록 서버 측 처리 구조를 사용하고, 인증된 사용자별 데이터 접근 제어 등 합리적인 보호 조치를 적용하도록 설계되어 있습니다.</p></section>
    <section><h2>7. 방침 변경</h2><p>수집 항목이나 외부 처리 구조가 바뀌면 이 방침을 갱신할 수 있습니다. 중요한 변경은 서비스 화면 등을 통해 안내하도록 노력합니다.</p></section>
    <section><h2>8. 문의</h2><p>개인정보와 관련한 문의는 문의하기 페이지의 운영 채널을 확인해 주세요. 정식 서비스 공개 전에는 실제 운영자 연락처와 필요한 사업자 정보를 추가로 확인하는 것을 권장합니다.</p></section>
  </article>;
}

function Contact() {
  return <article className="legal-card contact-card">
    <section><h2>서비스 문의</h2><p>버그 제보, 기능 제안, 사용 중 불편한 점은 현재 MoonWords GitHub 저장소의 Issues에서 받을 수 있습니다.</p><a className="contact-primary" href="https://github.com/seouk-Moon/moonwords/issues" target="_blank" rel="noreferrer">GitHub Issues 열기 →</a></section>
    <section><h2>문의할 때 적어주면 좋은 내용</h2><p>사용 중인 기능, 문제가 발생한 순서, 예상한 동작과 실제 동작, 가능하다면 오류 화면을 함께 알려주면 확인에 도움이 됩니다.</p></section>
    <section className="contact-warning"><h2>개인정보 주의</h2><p>GitHub Issues는 공개 공간일 수 있습니다. 비밀번호, API 키, 계정 인증 정보, 개인 문서 원문 등 민감한 정보는 절대 게시하지 마세요. 계정 삭제나 개인정보 관련 전용 연락처는 정식 공개 전에 별도로 추가하는 것이 좋습니다.</p></section>
  </article>;
}
