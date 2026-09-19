import type {
  AnalysisSection,
  AnalysisSentence,
  DocumentAnalysis,
} from "../types";
import { normalizeCefrLevel } from "./cefr";

export type StudySentenceEntry = {
  sentence: AnalysisSentence;
  /** 화면에서 보여 주는 번호입니다. AI가 만든 id와 무관하게 항상 1부터 이어집니다. */
  displayNumber: number;
  sourceIndex: number;
};

export type StudySectionGroup = {
  key: string;
  section: AnalysisSection;
  sentences: StudySentenceEntry[];
};

const fallbackSection = (): AnalysisSection => ({
  id: 1,
  label: "본문",
  role: "전체 본문",
});

/**
 * 이미 저장된 문서는 단어장과 학습 기록이 sentence.id를 참조하므로 id를 바꾸면 안 됩니다.
 * 대신 화면용 그룹만 만들고, 잘못된 paragraph를 가진 문장도 직전 섹션에 배치해 하나도 버리지 않습니다.
 */
export function buildStudySectionGroups(analysis: DocumentAnalysis): StudySectionGroup[] {
  const sourceSections = Array.isArray(analysis.sections) && analysis.sections.length
    ? analysis.sections
    : [fallbackSection()];
  const groups: StudySectionGroup[] = sourceSections.map((section, index) => ({
    key: `${section.id}-${index}`,
    section,
    sentences: [],
  }));
  const firstGroupById = new Map<number, number>();
  sourceSections.forEach((section, index) => {
    if (!firstGroupById.has(section.id)) firstGroupById.set(section.id, index);
  });

  let activeGroupIndex = 0;
  const sentences = Array.isArray(analysis.sentences) ? analysis.sentences : [];
  sentences.forEach((sentence, sourceIndex) => {
    const exactGroupIndex = firstGroupById.get(sentence.paragraph);
    if (exactGroupIndex !== undefined) {
      // 문장 원래 순서를 유지하기 위해 섹션이 뒤로 갔다가 다시 앞으로 오지 않게 합니다.
      activeGroupIndex = Math.max(activeGroupIndex, exactGroupIndex);
    } else if (
      Number.isInteger(sentence.paragraph) &&
      sentence.paragraph >= 1 &&
      sentence.paragraph <= groups.length
    ) {
      // 일부 AI 응답은 실제 section id 대신 section의 1-based 위치를 반환합니다.
      activeGroupIndex = Math.max(activeGroupIndex, sentence.paragraph - 1);
    }

    groups[activeGroupIndex].sentences.push({
      sentence,
      displayNumber: sourceIndex + 1,
      sourceIndex,
    });
  });

  return groups;
}

/**
 * 새 분석 결과를 저장하기 전에 관계형 id를 한 번 정리합니다.
 * 새 문서는 아직 단어장/진도 참조가 없으므로 문장 id를 안전하게 1..N으로 만들 수 있습니다.
 */
export function normalizeNewDocumentAnalysis(analysis: DocumentAnalysis): DocumentAnalysis {
  const sourceSections = Array.isArray(analysis.sections) && analysis.sections.length
    ? analysis.sections
    : [fallbackSection()];
  const sectionIdMap = new Map<number, number>();
  const sections = sourceSections.map((section, index) => {
    const normalizedId = index + 1;
    if (!sectionIdMap.has(section.id)) sectionIdMap.set(section.id, normalizedId);
    return {
      ...section,
      id: normalizedId,
      label: String(section.label || `구간 ${normalizedId}`),
      role: String(section.role || "본문 내용"),
    };
  });

  let activeSectionId = 1;
  const sentences = (Array.isArray(analysis.sentences) ? analysis.sentences : []).map((sentence, index) => {
    const mappedSectionId = sectionIdMap.get(sentence.paragraph);
    if (mappedSectionId !== undefined) {
      activeSectionId = Math.max(activeSectionId, mappedSectionId);
    } else if (
      Number.isInteger(sentence.paragraph) &&
      sentence.paragraph >= 1 &&
      sentence.paragraph <= sections.length
    ) {
      activeSectionId = Math.max(activeSectionId, sentence.paragraph);
    }

    return {
      ...sentence,
      id: index + 1,
      paragraph: activeSectionId,
      keywords: Array.isArray(sentence.keywords) ? sentence.keywords : [],
    };
  });

  return { ...analysis, level: normalizeCefrLevel(analysis.level), sections, sentences };
}
