import {
  comprehensionQuestions,
  meaningBank,
  paragraphs,
  sentences,
} from "../app/data";
import type { StudyDocument } from "./types";

const keywordEntries = Object.entries(meaningBank).sort(
  (left, right) => right[0].length - left[0].length,
);

export const demoDocument: StudyDocument = {
  id: "demo-spacex",
  user_id: "demo-user",
  title: "Defunct SpaceX rocket crashes into the moon, kicks up dust",
  source_name: "1차시(SpaceX).pdf",
  source_type: "pdf",
  source_file_path: null,
  original_text: sentences.map((sentence) => sentence.english).join("\n\n"),
  analysis: {
    level: "Intermediate",
    topic: "Space & Science",
    summary:
      "우연한 달 충돌은 작은 과학적 단서를 남겼고, 동시에 미래 달 탐사를 위한 우주 쓰레기 관리의 필요성을 드러냈다.",
    structure:
      "사건 → 과학적 관측 → 원인과 과정 → 우주 쓰레기 문제 → 미래 대응",
    sections: paragraphs,
    sentences: sentences.map((sentence) => ({
      ...sentence,
      keywords: keywordEntries
        .filter(([word]) =>
          sentence.english.toLowerCase().includes(word.toLowerCase()),
        )
        .slice(0, 8)
        .map(([word, meaning]) => ({ word, meaning })),
    })),
    questions: comprehensionQuestions,
  },
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-20T00:00:00.000Z",
};
