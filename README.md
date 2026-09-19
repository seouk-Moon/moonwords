# MoonWords · AI English Studio

영어 PDF, DOCX, TXT/MD 또는 붙여넣은 본문을 문장별 번역·문맥 단어장·듣기·이해 분석·퀴즈가 포함된 개인 학습지로 바꾸는 웹 앱입니다.

## 구성

- GitHub Pages: 정적 React 프런트엔드
- Supabase Auth: 이메일/비밀번호 로그인과 이메일 인증
- Supabase Postgres + Storage: 사용자별 본문, 원본 파일, 단어장, 진도 저장
- Supabase Edge Functions: Gemini 호출 프록시
- Gemini API: 문장 분리·번역·핵심 어휘·구조 분석·이해 문제 생성

Gemini 키는 Edge Function secret으로만 보관합니다. GitHub 변수에는 공개 가능한 Supabase URL과 publishable key만 등록합니다. 데이터 테이블과 파일 버킷에는 RLS가 적용되어 로그인 사용자 본인의 행과 폴더에만 접근할 수 있습니다.

## 1. Supabase 준비

1. 새 Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/migrations/202608200001_initial_schema.sql`을 실행합니다.
3. Authentication → Providers에서 Email을 켜고, Confirm email을 활성화합니다.
4. Authentication → URL Configuration에 GitHub Pages 주소를 Site URL과 Redirect URLs로 등록합니다.
5. Supabase CLI로 로그인한 뒤 migration, 함수와 secret을 반영합니다.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
npx supabase secrets set GEMINI_MODEL=gemini-3.8-flash
npx supabase secrets set GEMINI_FALLBACK_MODELS=gemini-3.7-flash,gemini-3.5-flash-lite
npx supabase functions deploy process-document
```

이미 운영 중인 프로젝트라면 최소한 `supabase/migrations/202609190001_folder_order.sql`을 SQL Editor에서 한 번 실행해야 폴더 순서가 기기 간에 저장됩니다. Gemini 호출은 Edge Function 안에서 일시적인 429/503/5xx 오류를 지수 백오프로 재시도하고, 계속 실패하면 설정된 대체 모델을 순서대로 사용합니다. 추가 본문 이해 문제는 전체 본문 분석을 다시 만들지 않고 문제만 생성해 응답 시간과 오류 가능성을 줄입니다.

## 2. 로컬 실행

`.env.example`을 `.env.local`로 복사하고 프로젝트 Settings → API에서 URL과 publishable key를 넣습니다.

```bash
npm install
npm run dev
```

GitHub Pages용 정적 빌드 검증:

```bash
npm run build:pages
```

이 명령은 빌드 전에 저장소 전체의 Git 병합 충돌 표시(`<<<<<<<`, `>>>>>>>`)를 검사합니다. 충돌 표시가 남아 있으면 문제가 있는 파일명을 먼저 출력하고 중단하므로, PostCSS 같은 후속 도구의 모호한 파싱 오류를 방지합니다.

GitHub Pages 빌드에는 서로 분리된 두 페이지가 함께 생성됩니다.

- `index.html`: 기존 Moonwords 영어 학습 앱
- `pdf-extractor.html`: 로그인 없이 브라우저에서 작동하는 PDF 텍스트 추출기

PDF 추출기는 별도 Supabase 프로젝트·테이블·Edge Function을 사용하지 않습니다. 파일을 서버에 올리지 않고 브라우저에서 PDF.js로 읽으며, 글자 레이어가 없거나 깨진 스캔본은 Tesseract.js 영어 OCR로 자동 보완합니다. OCR은 저화질 인식률을 높이기 위해 페이지를 확대·회색조·대비 보정하고 앞 30페이지까지 처리합니다. `Moonwords로 보내기`를 선택했을 때만 같은 탭의 임시 저장 공간을 통해 기존 본문 입력 화면과 연결됩니다. 관련 코드는 `src/pdf-extractor/` 폴더에 분리되어 있습니다.

앱 오른쪽 아래의 `도움말` 버튼은 모든 화면에서 열고 접을 수 있습니다. `문제 해결` 모드는 문장 수 불일치, PDF/OCR, Gemini 503, 제목·폴더, 퀴즈와 듣기 문제를 로컬에서 안내하므로 외부 API를 사용하지 않습니다. `본문 질문` 모드는 현재 열린 본문의 번호가 붙은 문장과 최근 대화만 Edge Function을 통해 Gemini에 보내 핵심 내용, 특정 문장, 표현과 주장에 대한 후속 질문에 답합니다.

본문 학습 화면은 AI 응답의 문장 ID가 반복되거나 존재하지 않는 문단 ID가 포함되어도 원래 문장 배열을 기준으로 1부터 끝까지 연속 번호를 표시합니다. 기존 문서의 단어장·학습 기록 ID는 그대로 보존하고, 새 문서는 프런트엔드와 Edge Function 양쪽에서 ID와 문단 연결을 저장 전에 정규화합니다.

본문 난이도는 국제 표준 CEFR `A1 · A2 · B1 · B2 · C1 · C2`만 사용합니다. 기존에 저장된 Beginner, Intermediate, Advanced 등의 값도 화면에서 가장 가까운 CEFR 단계로 자동 변환합니다. 내 본문 카드의 `삭제` 버튼은 확인 창을 거친 뒤 본문과 연결 데이터 및 Storage 원본을 정리하며, 별도 데이터베이스 migration은 필요하지 않습니다.

Supabase 환경 변수가 없으면 원래 SpaceX 본문으로 기능을 살펴볼 수 있는 DEMO 모드가 열립니다. 실제 회원가입·클라우드 저장·새 본문 분석은 Supabase 연결 후 활성화됩니다.

## 3. GitHub Pages 배포

1. 이 폴더를 GitHub 저장소의 `main` 브랜치에 push합니다.
2. 저장소 Settings → Pages → Build and deployment에서 Source를 **GitHub Actions**로 선택합니다.
3. Settings → Environments → `github-pages` → Environment variables에 다음을 등록합니다.
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Actions 탭의 `Deploy MoonWords to GitHub Pages`를 실행합니다.

`.github/workflows/deploy-pages.yml`이 매번 `main` push 시 빌드와 배포를 자동으로 수행합니다.

## 보안 및 비용

- 사용자가 입력하는 Gemini 키가 아니라, 앱 운영자가 등록한 서버 키를 공용으로 사용합니다.
- 악용 방지를 위해 Gemini/Google Cloud 예산 알림과 사용량 제한을 설정하고, 공개 운영 전 Edge Function에 사용자별 일일 분석 횟수 제한을 추가하는 것을 권장합니다.
- 긴 본문은 호출 비용이 커질 수 있습니다. 현재 클라이언트와 서버 모두 최대 120,000자로 제한합니다.
- 공개 서비스라면 이용약관, 개인정보처리방침, 계정/데이터 삭제 기능을 추가해야 합니다.
