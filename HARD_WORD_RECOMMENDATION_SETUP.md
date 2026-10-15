# 어려운 단어 추천 컷 상향

현재 GitHub main(fc5abc8)을 기준으로 이 수정에 필요한 파일만 담았습니다.

## 적용
ZIP 안의 파일을 기존 저장소의 같은 경로에 덮어쓰기 → Commit → Push origin → 배포 후 새로고침하세요. 추가 SQL, Edge Function 배포, API 키, Python 설치는 필요 없습니다.

## 변경
기존에는 분석 결과의 모든 keywords를 추천했습니다. 이제 ‘어려운 단어 미리 확인’과 챕터별 ‘모르는 단어’ 목록에서 난도 필터를 적용합니다. 이미 분석한 본문도 다시 생성할 필요 없이 바로 적용됩니다.

- 빈도가 높은 영어 단어 6013개(아래 데이터 기준)와 그 기본적인 복수형/시제 변화는 제외합니다.
- give up, take care of 같은 흔한 단어 조합은 제외하고, 드문 단어가 포함된 표현과 일부 고급 관용 표현을 남깁니다.
- 짧은 단어도 드물면 추천합니다. 단어 길이로 난도를 결정하지 않습니다.
- 이미 저장한 단어와 중복 후보, 뜻이 비어 있거나 원문에 없는 후보는 제외합니다.
- 추천할 단어가 적어도 쉬운 단어로 개수를 채우지 않습니다.
- 본문의 원래 키워드·번역과 기존 저장 단어장은 변경하지 않습니다. 직접 드래그해서 저장하는 기능도 유지합니다.

이 기준은 사용 빈도를 활용한 추천용 추정이며 CEFR 인증이나 개인별 숙련도 판정은 아닙니다. 예: important, information, education은 제외하고 defunct, debris, trajectory, mitigate 등은 추천 대상으로 유지합니다.

## 데이터 출처와 라이선스
common-english-words.ts는 wordfreq 3.1.1의 영어 빈도 중 Zipf >= 4.1인 ASCII 알파벳 항목을 추려 구성한 ‘흔한 단어 제외 목록’입니다. 실제 앱에는 이 정적 목록만 포함하며 외부 API를 부르지 않습니다.

원저자 Robyn Speer, wordfreq: https://github.com/rspeer/wordfreq
데이터 파일과 그 수정본은 CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
변환 내용과 Google Books Ngrams, Wikipedia, Leeds Internet Corpus, ParaCrawl, OpenSubtitles, SUBTLEX 등의 출처 표기는 데이터 파일 머리말에 포함했습니다. 배포할 때 그 머리말을 유지해 주세요. 전체 원출처/저자: https://github.com/rspeer/wordfreq#license

## 검증
GitHub Pages 빌드, 추천 컷 회귀 테스트 5개, 브라우저에서 본문 전체/챕터 추천 개수와 카드 내용 확인.
