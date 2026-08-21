const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type OrderingExercise = {
  excerpt: string;
  answerTokens: string[];
  shuffledTokens: Array<{ id: string; text: string }>;
  shortened: boolean;
};

export const chooseOrderingExcerpt = (sentence: string, shortenLongSentence: boolean, maxWords = 14) => {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  if (!shortenLongSentence || countWords(normalized) <= maxWords) return normalized;

  const clauses = normalized
    .split(/(?<=[,;:—–])\s+|\s+(?=(?:and|but|because|although|though|while|when|which|who|that)\b)/i)
    .map((part) => part.trim())
    .filter((part) => countWords(part) >= 6 && countWords(part) <= maxWords);

  if (clauses.length) {
    return clauses.sort((left, right) => countWords(right) - countWords(left))[0];
  }

  const words = normalized.split(/\s+/);
  let end = maxWords;
  if (/^[A-Z][A-Za-z'’-]*[,;:]?$/.test(words[end - 1] ?? "") && /^[A-Z][A-Za-z'’-]*[,;:]?$/.test(words[end] ?? "")) end += 1;
  return words.slice(0, end).join(" ");
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
  const excerpt = chooseOrderingExcerpt(sentence, shortenLongSentence);
  const answerTokens = tokenizeOrderingSentence(excerpt, protectedPhrases);
  return {
    excerpt,
    answerTokens,
    shuffledTokens: shuffleTokens(answerTokens),
    shortened: excerpt !== sentence.replace(/\s+/g, " ").trim(),
  };
};
