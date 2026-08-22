# MoonWords Modern Study 리팩터링

이번 리팩터링은 기존 기능을 제거하지 않고, 앞으로 기능을 추가하기 쉬운 구조로 분리하면서 A안(Modern Study) 디자인을 적용한 버전입니다.

## 핵심 변경

- `src/App.tsx`: 892줄 규모의 단일 파일에서 화면 조립 중심의 119줄로 축소
- 로그인 / 업로드 / 서재 / 본문 학습 / 단어장 / 퀴즈를 기능 폴더로 분리
- 세션·본문·단어·진행도 상태를 `src/hooks/useStudyWorkspace.ts`로 분리
- 추가 퀴즈 생성 상태/재시도/저장 로직을 `src/hooks/useQuizGeneration.ts`로 분리
- 공통 상단 메뉴와 모바일 하단 메뉴를 `src/components/layout/`으로 분리
- Modern Study 디자인을 `src/styles/modern-study.css`로 분리
- 모바일에서 상단 메뉴가 숨겨져 단어장에서 빠져나가지 못하던 문제를 하단 고정 네비게이션으로 해결
- Supabase Edge Function `process-document`는 기존 동작을 유지

## 구조

```text
src/
├─ App.tsx
├─ app-types.ts
├─ components/
│  ├─ brand/
│  │  └─ Logo.tsx
│  ├─ layout/
│  │  ├─ AppHeader.tsx
│  │  └─ MobileBottomNav.tsx
│  └─ ui/
│     └─ AppIcon.tsx
├─ features/
│  ├─ auth/AuthScreen.tsx
│  ├─ library/LibraryPage.tsx
│  ├─ upload/UploadPanel.tsx
│  ├─ study/
│  │  ├─ StudyView.tsx
│  │  └─ HighlightedEnglish.tsx
│  ├─ vocabulary/Wordbook.tsx
│  └─ quiz/
│     ├─ Quiz.tsx
│     ├─ GenerationToast.tsx
│     └─ quiz-utils.ts
├─ hooks/
│  ├─ useStudyWorkspace.ts
│  └─ useQuizGeneration.ts
├─ lib/
│  ├─ app-utils.ts
│  ├─ file-parsers.ts
│  ├─ function-error.ts
│  ├─ ordering-quiz.ts
│  └─ supabase.ts
└─ styles/
   └─ modern-study.css
```

## 기존 기능 보존

다음 기능은 제거하지 않았습니다.

- 이메일 로그인 / 회원가입
- PDF / DOCX / TXT / MD 파일 업로드
- 텍스트 붙여넣기
- Supabase Storage 원본 파일 저장
- Gemini 기반 본문 분석 및 재시도
- 문장별 영어/한글 학습
- 단어 드래그 문맥 뜻 조회
- 단어 저장 / 수정 / 삭제
- 전체 본문 듣기 / 문장 듣기
- 이해 체크 / 어려움 체크
- 단어장 검색 및 복습 상태
- 본문 이해 퀴즈
- 단어 뜻 퀴즈(선택형/서술형)
- 플래시카드 및 스와이프 복습
- 빈칸 완성 퀴즈
- 어순 배열 퀴즈
- 본문 이해 오답 저장 및 오답만 다시 풀기
- 추가 본문 이해 문제 생성
- 추가 빈칸 문제 생성
- 문제 생성 중단 및 완료 알림
- `process-document` Edge Function의 `analyze`, `define`, `tts`

## 디자인

UI는 Pretendard Variable을 중심으로 굵기를 올렸습니다.

- 일반 UI: 520 이상
- 버튼/탭: 650~720
- 제목: 760~820
- 영어 원문: 기존 serif 계열 유지

배경은 밝은 회색, 카드는 흰색, 포인트는 MoonWords 블루로 통일했습니다.

## 모바일 네비게이션

900px 이하에서는 화면 하단에 다음 메뉴가 항상 표시됩니다.

- 내 본문
- 학습
- 단어장
- 퀴즈

현재 본문이 없을 때만 학습/단어장/퀴즈가 비활성화됩니다. 본문이 열린 뒤에는 단어장에서도 다른 화면으로 정상 이동할 수 있습니다.

## Edge Function

`supabase/functions/process-document/index.ts`는 이번 프런트 리팩터링에서 수정하지 않았습니다. 기존 Supabase 배포본과 동일한 요청 형태를 유지합니다.
