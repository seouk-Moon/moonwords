"use client";

import { useState } from "react";
import { cloudConfigured, configureSupabase, supabase } from "./lib/supabase";
import { AppHeader } from "./components/layout/AppHeader";
import { MobileBottomNav } from "./components/layout/MobileBottomNav";
import { Logo } from "./components/brand/Logo";
import { AuthScreen } from "./features/auth/AuthScreen";
import { UploadPanel } from "./features/upload/UploadPanel";
import { LibraryPage } from "./features/library/LibraryPage";
import { StudyView } from "./features/study/StudyView";
import { Wordbook } from "./features/vocabulary/Wordbook";
import { Quiz } from "./features/quiz/Quiz";
import { GenerationToast } from "./features/quiz/GenerationToast";
import { useStudyWorkspace } from "./hooks/useStudyWorkspace";
import { useQuizGeneration } from "./hooks/useQuizGeneration";

type AppProps = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

export default function App({ supabaseUrl, supabasePublishableKey }: AppProps = {}) {
  configureSupabase(supabaseUrl, supabasePublishableKey);
  const configured = cloudConfigured;
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);

  const workspace = useStudyWorkspace(configured);
  const quizGeneration = useQuizGeneration({
    current: workspace.current,
    documents: workspace.documents,
    words: workspace.words,
    session: workspace.session,
    openDocument: workspace.openDocument,
    applyUpdatedDocument: workspace.applyUpdatedDocument,
    setView: workspace.setView,
  });

  if (workspace.loading) {
    return <div className="loading-screen"><Logo /><p>내 학습실을 여는 중…</p></div>;
  }
  if (configured && !workspace.session) return <AuthScreen />;

  return (
    <div className="app-shell">
      <AppHeader
        view={workspace.view}
        hasCurrent={Boolean(workspace.current)}
        configured={configured}
        session={workspace.session}
        onView={workspace.setView}
        onSignOut={() => { void supabase?.auth.signOut(); }}
      />

      {quizGeneration.generationJob && (
        <GenerationToast
          job={quizGeneration.generationJob}
          onStop={quizGeneration.stopQuizGeneration}
          onOpen={quizGeneration.openGeneratedQuiz}
          onDismiss={() => quizGeneration.setGenerationJob(null)}
        />
      )}

      {workspace.view === "library" && (
        <LibraryPage
          documents={workspace.documents}
          folders={workspace.folders}
          onOpen={workspace.openDocument}
          onUpload={(folderId = null) => { setUploadFolderId(folderId); workspace.setView("upload"); }}
          onCreateFolder={workspace.createFolder}
          onRenameFolder={workspace.renameFolder}
          onDeleteFolder={workspace.deleteFolder}
          onMoveDocument={workspace.moveDocumentToFolder}
          learningAnalytics={workspace.learningAnalytics}
        />
      )}

      {workspace.view === "upload" && workspace.session && (
        <UploadPanel
          userId={workspace.session.user.id}
          folderId={uploadFolderId}
          onCreated={workspace.addDocumentAndOpen}
          onCancel={() => workspace.setView("library")}
        />
      )}

      {workspace.current && workspace.view === "study" && (
        <StudyView
          doc={workspace.current}
          words={workspace.words}
          progress={workspace.progress}
          onSaveWord={workspace.saveWord}
          onDeleteWord={workspace.deleteWord}
          onProgress={workspace.saveProgress}
        />
      )}

      {workspace.current && workspace.view === "words" && (
        <Wordbook
          words={workspace.words}
          progress={workspace.progress}
          onUpdate={workspace.updateWord}
          onDelete={workspace.deleteWord}
          onStudy={() => workspace.setView("study")}
        />
      )}

      {workspace.current && workspace.view === "quiz" && (
        <Quiz
          doc={workspace.current}
          words={workspace.words}
          progress={workspace.progress}
          generationJob={quizGeneration.generationJob}
          onClose={() => workspace.setView("study")}
          onGenerate={(type, count) => { void quizGeneration.startQuizGeneration(type, count); }}
          onProgress={workspace.saveProgress}
          onResult={workspace.quizResult}
          onQuestionAnswered={workspace.recordQuizAnswer}
          onQuizComplete={workspace.recordQuizAttempt}
        />
      )}

      <MobileBottomNav
        view={workspace.view}
        hasCurrent={Boolean(workspace.current)}
        onView={workspace.setView}
      />
    </div>
  );
}
