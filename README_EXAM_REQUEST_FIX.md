# Moon Exam ‘지원하지 않는 요청’ 수정

## 확인한 원인
현재 GitHub main 99342be의 src/features/exam/main.tsx는 process-document에 action='generate-exam'을 보냅니다. 그런데 동일 저장소의 서버 함수에는 해당 action 분기가 없어 '지원하지 않는 요청입니다.'로 거부하고 있었습니다. 서버에 시험 제작 처리 전체를 복구했습니다.

## 네가 할 일 (한 번)
1. ZIP을 풀고 기존 **moonwords** 저장소의 같은 경로 파일로 덮어쓴 뒤 GitHub Desktop에서 Commit → Push합니다.
2. Supabase 대시보드에서 MoonWords가 사용하는 프로젝트를 선택합니다.
3. **Edge Functions → process-document → Code**를 엽니다. ZIP 안의 **supabase/functions/process-document/index.ts** 파일을 편집기로 열어 **전체 복사**하고, 서버의 기존 index.ts 내용을 **전체 교체**한 뒤 **Deploy**합니다. 함수 이름은 기존 process-document를 그대로 사용합니다. 기존 Secrets/API 키 설정은 유지합니다. 새 함수를 다른 이름으로 만들거나 코드 일부를 아래에 덧붙이지 마세요.
4. 배포 완료 후 Moon Exam을 새로고침합니다. 먼저 본문 1개, 총 1문제로 시험을 만듭니다. 필기가 저장된 본문이 아니면 출제 범위를 **본문 전체 (필기 참고)**로 선택합니다.

**GitHub에 올리는 것만으로 Supabase 함수 코드가 바뀌지는 않습니다. 3번이 이번 오류 해결의 핵심입니다. SQL 실행이나 새 API 키는 필요 없습니다.**

## 수정 내용
- 네 가지 시험 유형을 처리하는 generate-exam 분기 복구.
- 로그인 사용자 소유의 본문만 조회, 출제 개수·필드·본문 인용·필기 근거·중복 검증.
- AI 응답 제한, 대체 모델, 기존 본문 분석/사진 분석/챗/단어/음성 기능 유지.
- 만약 서버가 다시 옛 버전으로 돌아가면 시험 화면에서 ‘시험 생성 서버가 이전 버전’이라는 구체적인 안내 표시.
- 현재 저장소에 반영된 하단 정리/OCR/폴더 수정은 그대로 유지합니다.

## 검증
14개 서버 테스트 통과. 화면과 같은 요청(scope와 네 유형 counts)을 보내 4개 문제가 반환되는 테스트, 필기 범위/소유권/잘못된 결과 거부, 사진 분석, AI 대기 제한 회귀 테스트가 포함됩니다. Pages 빌드 및 git diff --check 통과. 실제 운영 Supabase 함수 배포나 실제 AI 생성 호출은 대신 실행하지 않았습니다.
