# MOONS 앱 모음으로 정리 · Moon OCR 독립 화면

## 이번 수정
- MoonWords 하단에서 '서비스' 제목 아래의 영어 시험/Drive/텍스트 추출/Printmaker 링크 묶음을 제거했습니다. 문의·약관·개인정보 안내는 유지합니다.
- 별도 도구 화면 `ocr.html`을 추가했습니다. 이름은 Moon OCR이며 MOONS 홈페이지에서 직접 열 수 있습니다. 같은 moonwords 저장소에서 배포되지만 로그인 없이 단독 실행합니다. 새 저장소는 필요 없습니다.
- 일반 PDF는 글자 정보를 직접 추출하고, 스캔 PDF는 영어·한국어 OCR로 읽습니다. JPG/PNG 직접 입력은 이번 범위에 포함하지 않았습니다. PDF 전용이라는 설명을 화면과 MOONS 카드에 표시했습니다.
- 복사, TXT 저장, 결과 수정, 수동 OCR 재인식, 선택적인 MoonWords로 보내기를 유지합니다.
- 기존 `pdf-extractor.html` 주소도 그대로 열립니다.
- MOONS 홈페이지에는 Moon OCR과 Moon Exam 카드를 추가합니다. 기존 하단 링크 제거 후에도 영어 시험을 찾을 수 있습니다.
- 이전 폴더 이동/이름 변경 수정은 이 ZIP에 누적돼 있습니다.

## 네가 할 일 (두 저장소에 각각 반영)
1. 이 ZIP의 파일을 **moonwords** 저장소의 같은 경로에 덮어쓰고 Commit → Push합니다. `ocr.html`과 `vite.pages.config.ts`, `src/pdf-extractor/` 변경도 포함해야 합니다.
2. 함께 제공된 **moons-homepage.zip**은 **seouk-moon.github.io** 저장소에 덮어쓰고 Commit → Push합니다. 이 둘을 서로 다른 저장소에 넣어야 합니다.
3. 두 저장소 배포 완료 후 새로고침합니다. MOONS의 Moon OCR 카드로 들어갈 수 있습니다.

이번 OCR/하단 정리는 SQL이나 Edge Function 배포가 필요 없습니다. 다만 이전 폴더 이동 업데이트의 `supabase/migrations/202610220001_nested_folders.sql`을 아직 실행하지 않았다면 SQL Editor에서 한 번 실행하세요. 이미 실행했다면 건너뜁니다.

## 검증
- Pages 빌드 통과; 새 OCR 주소와 예전 PDF 추출 주소 모두 산출물에 포함됩니다.
- 실제 브라우저에서 로그인 없이 생성한 PDF를 넣어 글자 추출과 TXT 다운로드를 확인했습니다. 360px OCR, 390px MOONS 화면의 가로 넘침이 없었습니다.
- MOONS의 총 6개 앱, 문서 분류 3개, Moon OCR/Exam 링크 주소를 확인했습니다.
- 하단 앱 링크 제거와 법적/문의 안내 유지 확인. MoonWords 전체 앱 미리보기는 HTTP 환경에서 기존 crypto.randomUUID 제한이 있어 전체 앱 동작 검증으로 보고하지 않습니다. 운영 GitHub Pages HTTPS 배포는 직접 수행하지 않았습니다.
- OCR 인식 엔진 자체는 변경하지 않았으며 이번 검증에서 스캔 PDF 인식 정확도를 다시 측정하지 않았습니다.
