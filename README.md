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
5. Supabase CLI로 로그인한 뒤 함수를 배포하고 secret을 등록합니다.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
npx supabase secrets set GEMINI_MODEL=gemini-3.7-flash
npx supabase functions deploy process-document
```

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
