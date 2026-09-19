# PDF Text Extractor

Moonwords 본 앱과 분리된 PDF 텍스트 추출 도구입니다.

- `PdfExtractorApp.tsx`: 파일 선택, 추출 결과 편집·복사·다운로드 UI
- `pdf-extractor.css`: 독립 페이지 전용 스타일
- `main.tsx`: `pdf-extractor.html` 진입점
- `transfer.ts`: 추출 텍스트를 같은 탭의 Moonwords 본문 입력으로 전달하는 임시 저장소
- `ocr.ts`: 이미지형·저화질 PDF를 페이지 이미지로 보정한 뒤 Tesseract.js 영어 OCR로 읽는 fallback

PDF 분석은 `src/lib/file-parsers.ts`의 공용 PDF.js 파서를 사용하며 브라우저 안에서 실행됩니다. 글자 레이어가 없거나 깨졌으면 OCR로 자동 전환하며, 수동 `OCR로 다시 읽기`도 지원합니다. 브라우저의 과도한 메모리·배터리 사용을 막기 위해 스캔 OCR은 앞 30페이지까지 처리합니다. 별도 Supabase 프로젝트, 테이블 또는 Edge Function을 사용하지 않습니다.
