# Moon Drive 설치 안내

최신 GitHub main(b5ba0a0)을 기준으로 기존 학습 기능을 유지하면서 추가했습니다.
MoonWords 하단 서비스 링크에서 별도의 Moon Drive 페이지로 이동합니다.
독립 주소: https://seouk-moon.github.io/moonwords/drive.html
드라이브는 MoonWords 학습 화면·회원 로그인·스타일과 분리되어 있습니다. MoonWords 회원가입 없이도 관리자가 정한 코드로 이용합니다.
같은 저장소에서 배포하지만 파일은 전용 private 버킷과 전용 테이블로 분리해 보관합니다.

이전 드라이브 ZIP을 적용했다면 src/App.tsx도 이번 ZIP 파일로 덮어써 주세요. 학습 화면에 삽입됐던 드라이브를 제거합니다.
SQL 실행·코드 설정·함수 배포를 이미 마쳤다면 이번에는 프런트엔드만 덮어쓰고 Push하면 됩니다. SQL을 다시 실행할 필요가 없습니다.

## 1. 소스 적용

이 ZIP의 파일을 같은 경로로 덮어쓰고 Commit → Push origin 하세요.
기존 파일이나 본문, 단어장 데이터는 삭제하지 마세요.

## 2. Supabase 데이터베이스 준비 (한 번)

MoonWords에 연결된 Supabase 프로젝트에서 SQL Editor → New query를 엽니다.
`supabase/migrations/202610040001_moon_drive.sql` 내용을 전부 붙여넣고 Run 하세요.
이미 성공한 SQL은 다시 실행하지 마세요.
전용 private 저장소, 파일 목록, 잘못된 코드 입력 제한, 동시 업로드 용량 예약이 만들어집니다.
기존 본문/프로필 저장소는 변경하지 않습니다.

## 3. 코드 설정

Supabase → Edge Functions → Secrets에서 추가하세요.

| Name | Value |
| --- | --- |
| MOON_DRIVE_CODE | 직접 정한 숫자 6자리 (앞에 0도 가능) |
| MOON_DRIVE_MAX_MB | 200 (원하면 1~500 사이 변경) |

실제 코드는 GitHub, VITE_ 환경변수, 프런트엔드 코드에 쓰지 마세요.
여기서는 코드를 지정하지 않았으므로 원하는 값을 직접 설정해야 합니다.
Supabase가 기본 제공하는 SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY를 사용합니다. service role 키를 웹사이트에 추가하지 마세요.

## 4. 서버 함수 배포 (한 번)

Supabase → Edge Functions → Deploy a new function → Via Editor를 선택합니다.
함수 이름은 `moon-drive`로 정하고, index.ts에
`supabase/functions/moon-drive/index.ts`의 전체 내용을 붙여넣어 Deploy 하세요.
함수 설정에서 **Verify JWT / Enforce JWT verification**을 꺼 주세요.
회원 로그인 토큰 대신 함수 안에서 모든 요청의 6자리 코드를 검사하므로 필요한 설정입니다.

CLI를 이미 사용하는 경우 아래로 대신 배포할 수 있습니다.

```sh
supabase functions deploy moon-drive --no-verify-jwt
```

## 5. 확인

GitHub Pages 배포 완료 후 새로고침하고 하단 서비스의 파일 보관 · Moon Drive 링크를 누르세요. 새 탭에서 독립된 드라이브 화면이 열립니다.
틀린 코드는 접근이 거절되고, 설정한 코드로만 파일 목록이 열려야 합니다.
작은 파일 업로드 → 원본 다운로드 → 삭제 확인을 해 보세요.
삭제는 Storage 원본까지 지워 용량을 반환합니다.

## 이용 및 제한

- 파일당 20MB, 기본 드라이브 전체 200MB, 파일 최대 500개입니다.
- 코드를 아는 사람은 목록·업로드·다운로드·삭제를 모두 사용할 수 있습니다.
- 코드는 페이지 메모리에만 보관하고 새로고침하면 다시 입력합니다. 잠그기로 즉시 지울 수 있습니다.
- 잘못된 코드 입력이 프로젝트 전체에서 10분 동안 20회 쌓이면 최대 10분 잠깁니다. 6자리 숫자 코드의 무차별 시도를 제한하기 위한 방식입니다.
- 파일은 공개 URL이 없고, 다운로드 링크는 60초 동안 유효합니다.
- 업로드 실패/중단 후 미완료 파일이 보이면 업로드 작업이 끝난 뒤 삭제할 수 있습니다. 업로드가 진행 중인 다른 사람의 미완료 파일은 삭제하지 마세요.
- 이 용량 표시/상한은 Moon Drive 전용입니다. 같은 Supabase 프로젝트의 본문·아바타 등 다른 저장소와 합산한 전체 무료 사용량은 Supabase 대시보드에서 확인하세요.
- CORS는 별도 호스트에서도 같은 코드로 접근할 수 있게 허용합니다. 접근 허용은 서버 코드 검사로 결정됩니다.

## 인증 메일 주소 보정

기존 AuthScreen의 상대 경로(BASE_URL="./") 해석 기준을 현재 페이지 주소로 바꿨습니다.
GitHub Pages에서 인증 후 `/moonwords/`를 유지하도록 수정한 것입니다.

## 검증

`npm run build:pages`, `node --test tests/moon-drive.test.mjs` 실행.
서버 동작 테스트는 Storage/DB 모의 응답으로 코드 거절·잠금·용량 초과·업로드 실패 복구·삭제 실패 재시도를 검증합니다.
기존 퀴즈 포함 16개 테스트와 모바일 브라우저의 코드 입력·업로드·검색·삭제 확인·잠금 동작도 통과했습니다.
실제 Supabase 연동은 위 설치를 마친 뒤 확인해야 합니다.
