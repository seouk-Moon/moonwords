export type View = "library" | "study" | "words" | "quiz" | "upload";

export type QuizMode = "meaning" | "cloze" | "comprehension" | "ordering" | "flashcard";
export type OrderingScope = "all" | "difficult" | "selected";
export type ComprehensionScope = "all" | "incorrect";
export type VocabDirection = "english-korean" | "korean-english";
export type VocabFormat = "choice" | "written";
export type QuizGenerationType = "comprehension" | "cloze";

export type QuizGenerationJob = {
  id: number;
  type: QuizGenerationType;
  documentId: string;
  status: "running" | "success" | "error" | "cancelled";
  message: string;
};

export type ChoiceQuizQuestion = {
  kind: "choice";
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  wordId?: string;
  sourceQuestionId?: number;
};

export type WrittenQuizQuestion = {
  kind: "written";
  prompt: string;
  answerText: string;
  explanation: string;
  wordId: string;
};

export type FlashcardQuestion = {
  kind: "flashcard";
  front: string;
  back: string;
  example: string;
  translation: string;
  wordId: string;
};

export type OrderingQuizQuestion = {
  kind: "ordering";
  prompt: string;
  explanation: string;
  contextBefore?: string;
  contextAfter?: string;
  /** 같은 긴 문장에서 출제 구간 바로 앞에 제외된 부분 */
  sameSentenceBefore?: string;
  /** 같은 긴 문장에서 출제 구간 바로 뒤에 제외된 부분 */
  sameSentenceAfter?: string;
  sentenceId: number;
  answerTokens: string[];
  shuffledTokens: Array<{ id: string; text: string }>;
  shortened: boolean;
};

export type QuizQuestion = ChoiceQuizQuestion | WrittenQuizQuestion | FlashcardQuestion | OrderingQuizQuestion;

export type QuizMistakeReviewItem = {
  id: string;
  prompt: string;
  selected?: string;
  answer: string;
  explanation?: string;
};

export type SelectedWord = {
  word: string;
  sentenceId: number;
  meaning: string;
  x: number;
  y: number;
  savedId?: string;
  confirmDelete?: boolean;
};
