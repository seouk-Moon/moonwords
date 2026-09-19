# Printmaker 연결 추가

이 전체 프로젝트는 기존 수정 내용을 유지하고 사이트 하단 ‘서비스’ 목록에 Printmaker 학습지 만들기 링크를 추가합니다.

- Moonwords 저장소: 이 폴더 안의 파일 전체를 기존처럼 업로드합니다.
- Printmaker 저장소: 별도의 `printmaker_full.zip` 안 파일을 사용합니다. 두 프로젝트 파일을 섞지 마세요.
- 새 주소: https://seouk-moon.github.io/printmaker/
- 새 학습지 저장 테이블과 Edge Function은 Printmaker README대로 같은 Supabase 프로젝트에 추가합니다. 기존 `process-document`를 교체하거나 기존 데이터를 삭제하지 않습니다.
- Printmaker가 먼저 배포되어야 링크가 열립니다.

검증: Moonwords `npm run build:pages` 통과. 기존 PDF 가져오기 통로와 자동 로그인 저장 설정을 Printmaker에서 공유합니다. 실제 계정 연동은 양쪽 배포 후 확인해 주세요.
