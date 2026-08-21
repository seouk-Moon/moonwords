export type AnalysisKeyword = {
  word: string;
  meaning: string;
};

export type AnalysisSentence = {
  id: number;
  paragraph: number;
  english: string;
  korean: string;
  keywords: AnalysisKeyword[];
};

export type AnalysisSection = {
  id: number;
  label: string;
  role: string;
};

export type ReadingQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type DocumentAnalysis = {
  level: string;
  topic: string;
  summary: string;
  structure: string;
  sections: AnalysisSection[];
  sentences: AnalysisSentence[];
  questions: ReadingQuestion[];
  cloze_questions?: ReadingQuestion[];
};

export type StudyDocument = {
  id: string;
  user_id: string;
  title: string;
  source_name: string | null;
  source_type: string;
  source_file_path: string | null;
  original_text: string;
  analysis: DocumentAnalysis;
  created_at: string;
  updated_at: string;
};

export type VocabularyItem = {
  id: string;
  user_id: string;
  document_id: string;
  sentence_id: number;
  word: string;
  meaning: string;
  source_sentence: string;
  translation: string;
  note: string;
  status: "learning" | "mastered";
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  created_at: string;
  updated_at: string;
};

export type StudyProgress = {
  id?: string;
  user_id: string;
  document_id: string;
  understood_sentence_ids: number[];
  bookmarked_sentence_ids: number[];
  sentence_notes: Record<string, string>;
  last_studied_at: string;
};
