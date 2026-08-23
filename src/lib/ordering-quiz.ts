const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type OrderingExercise = {
  excerpt: string;
  sameSentenceBefore?: string;
  sameSentenceAfter?: string;
  answerTokens: string[];
  shuffledTokens: Array<{ id: string; text: string }>;
  shortened: boolean;
};

const grammarSignals: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(?:although|though|even though|whereas|while|unless|provided that|as long as)\b/i, weight: 8 },
  { pattern: /\b(?:because|since|so that|in order to|therefore|however|despite|in spite of)\b/i, weight: 7 },
  { pattern: /\b(?:who|whom|whose|which|that|where)\b/i, weight: 7 },
  { pattern: /\b(?:if|when|whenever|before|after|until|once|as soon as)\b/i, weight: 6 },
  { pattern: /\b(?:have|has|had)\s+(?:been\s+)?[a-z]+(?:ed|en)\b/i, weight: 7 },
  { pattern: /\b(?:am|is|are|was|were|be|been|being)\s+(?:not\s+)?[a-z]+(?:ing|ed|en)\b/i, weight: 6 },
  { pattern: /\b(?:can|could|may|might|must|should|would|will)\s+(?:not\s+)?(?:have\s+)?(?:been\s+)?[a-z]+\b/i, weight: 6 },
  { pattern: /\b(?:not only|either|neither|both)\b/i, weight: 5 },
  { pattern: /\b(?:to\s+[a-z]+|[a-z]+ing)\b/i, weight: 3 },
  { pattern: /\b(?:more|less|better|worse)\s+than\b|\bas\s+\w+\s+as\b/i, weight: 4 },
];

const scoreGrammarExcerpt = (excerpt: string, maxWords: number) => {
  const words = countWords(excerpt);
  if (words < 5 || words > maxWords + 2) return Number.NEGATIVE_INFINITY;
  let score = 0;
  for (const signal of grammarSignals) if (signal.pattern.test(excerpt)) score += signal.weight;
  if (/[,:;—–]/.test(excerpt)) score += 2;
  if (/\bnot\b/i.test(excerpt)) score += 1;
  if (/\b(?:and|but|or)\b/i.test(excerpt)) score += 1;
  const finalWord = excerpt.replace(/[,.!?;:—–]+$/g, "").trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
  if (/^(?:and|but|or|because|since|although|though|while|when|if|unless|which|who|whose|that|where|before|after|until|to|of|for|with|by|from|in|on|at|the|a|an)$/.test(finalWord)) score -= 10;
  const ideal = Math.min(11, maxWords);
  score += Math.max(0, 4 - Math.abs(words - ideal) * 0.45);
  return score;
};

const buildGrammarCandidates = (sentence: string, maxWords: number) => {
  const words = sentence.split(/\s+/).filter(Boolean);
  const candidates = new Set<string>();

  const clauseCandidates = sentence
    .split(/(?<=[,;:—–])\s+|\s+(?=(?:and|but|because|since|although|though|while|when|if|unless|which|who|whose|that|where|before|after|until)\b)/i)
    .map((part) => part.trim())
    .filter((part) => countWords(part) >= 5 && countWords(part) <= maxWords + 2);
  clauseCandidates.forEach((part) => candidates.add(part));

  words.forEach((word, index) => {
    const neighborhood = words.slice(Math.max(0, index - 2), Math.min(words.length, index + 3)).join(" ");
    const isAnchor = grammarSignals.some((signal) => signal.pattern.test(neighborhood));
    if (!isAnchor) return;
    const targetLength = Math.min(maxWords, words.length);
    let start = Math.max(0, index - Math.floor(targetLength * 0.42));
    let end = Math.min(words.length, start + targetLength);
    start = Math.max(0, end - targetLength);
    candidates.add(words.slice(start, end).join(" "));
  });

  if (!candidates.size) {
    const targetLength = Math.min(maxWords, words.length);
    for (let start = 0; start + 5 <= words.length; start += Math.max(3, Math.floor(targetLength / 3))) {
      candidates.add(words.slice(start, Math.min(words.length, start + targetLength)).join(" "));
    }
  }

  return [...candidates];
};

export const chooseOrderingExcerpt = (sentence: string, shortenLongSentence: boolean, maxWords = 14) => {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  if (!shortenLongSentence || countWords(normalized) <= maxWords) return normalized;

  const candidates = buildGrammarCandidates(normalized, maxWords);
  const ranked = candidates
    .map((excerpt) => ({ excerpt, score: scoreGrammarExcerpt(excerpt, maxWords) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => right.score - left.score || countWords(right.excerpt) - countWords(left.excerpt));

  if (ranked.length && ranked[0].score >= 3) return ranked[0].excerpt;

  const words = normalized.split(/\s+/);
  return words.slice(0, Math.min(maxWords, words.length)).join(" ");
};

const protectedProperNouns = (sentence: string) =>
  sentence.match(/\b(?:[A-Z][A-Za-z'’-]*)(?:\s+(?:[A-Z][A-Za-z'’-]*)){1,3}\b/g) ?? [];

export const tokenizeOrderingSentence = (sentence: string, protectedPhrases: string[] = []) => {
  const phrases = [...new Set([...protectedPhrases, ...protectedProperNouns(sentence)]
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.includes(" ")))]
    .sort((left, right) => right.length - left.length);
  const replacements = new Map<string, string>();
  let protectedSentence = sentence;

  phrases.forEach((phrase, index) => {
    const marker = `__MOONWORDS_PHRASE_${index}__`;
    const expression = new RegExp(`\\b${escapeRegExp(phrase).replace(/\s+/g, "\\s+")}\\b`, "gi");
    protectedSentence = protectedSentence.replace(expression, (matched) => {
      replacements.set(marker, matched);
      return marker;
    });
  });

  return protectedSentence
    .split(/\s+/)
    .map((token) => {
      for (const [marker, phrase] of replacements) {
        if (token.includes(marker)) return token.replace(marker, phrase);
      }
      return token;
    })
    .filter(Boolean);
};

const shuffleTokens = (tokens: string[]) => {
  const indexed = tokens.map((text, index) => ({ id: `${index}-${text}`, text }));
  const shuffled = [...indexed].sort(() => Math.random() - 0.5);
  if (shuffled.length > 1 && shuffled.every((token, index) => token.id === indexed[index].id)) {
    shuffled.push(shuffled.shift()!);
  }
  return shuffled;
};

export const buildOrderingExercise = (
  sentence: string,
  protectedPhrases: string[] = [],
  shortenLongSentence = true,
): OrderingExercise => {
  const normalizedSentence = sentence.replace(/\s+/g, " ").trim();
  const excerpt = chooseOrderingExcerpt(normalizedSentence, shortenLongSentence);
  const excerptIndex = normalizedSentence.indexOf(excerpt);
  const sameSentenceBefore = excerptIndex > 0
    ? normalizedSentence.slice(0, excerptIndex).trim()
    : undefined;
  const sameSentenceAfter = excerptIndex >= 0 && excerptIndex + excerpt.length < normalizedSentence.length
    ? normalizedSentence.slice(excerptIndex + excerpt.length).trim()
    : undefined;
  const answerTokens = tokenizeOrderingSentence(excerpt, protectedPhrases);
  return {
    excerpt,
    sameSentenceBefore,
    sameSentenceAfter,
    answerTokens,
    shuffledTokens: shuffleTokens(answerTokens),
    shortened: excerpt !== sentence.replace(/\s+/g, " ").trim(),
  };
};
