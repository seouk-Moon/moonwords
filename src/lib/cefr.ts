export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export type CefrLevel = typeof CEFR_LEVELS[number];

const cefrDescriptions: Record<CefrLevel, string> = {
  A1: "입문",
  A2: "초급",
  B1: "중급",
  B2: "중상급",
  C1: "고급",
  C2: "최상급",
};

/** 기존 자유 형식 난이도를 국제 표준 CEFR 6단계 중 하나로 변환합니다. */
export function normalizeCefrLevel(value: unknown): CefrLevel {
  const source = String(value ?? "").trim();
  const direct = source.toUpperCase().match(/(?:^|\b)(A1|A2|B1|B2|C1|C2)(?:\b|$)/)?.[1];
  if (direct && CEFR_LEVELS.includes(direct as CefrLevel)) return direct as CefrLevel;

  const normalized = source.toLowerCase().replace(/[\s_-]+/g, " ");
  if (/proficient|proficiency|mastery|near native|최상급|최고급/.test(normalized)) return "C2";
  if (/advanced|expert|고급/.test(normalized)) return "C1";
  if (/upper intermediate|high intermediate|중상급/.test(normalized)) return "B2";
  if (/pre intermediate|elementary|초급/.test(normalized)) return "A2";
  if (/intermediate|중급/.test(normalized)) return "B1";
  if (/beginner|starter|basic|입문|기초/.test(normalized)) return "A1";
  return "B1";
}

export function formatCefrLevel(value: unknown) {
  return `CEFR ${normalizeCefrLevel(value)}`;
}

export function describeCefrLevel(value: unknown) {
  const level = normalizeCefrLevel(value);
  return `${level} · ${cefrDescriptions[level]}`;
}
