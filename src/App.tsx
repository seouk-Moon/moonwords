"use client";

import { useState } from "react";
import { cloudConfigured, configureSupabase, supabase } from "./lib/supabase";
import { AppHeader } from "./components/layout/AppHeader";
import { MobileBottomNav } from "./components/layout/MobileBottomNav";
import { SiteFooter, type InfoPage } from "./components/layout/SiteFooter";
import { Logo } from "./components/brand/Logo";
import { AuthScreen } from "./features/auth/AuthScreen";
import { UploadPanel } from "./features/upload/UploadPanel";
import { LibraryPage } from "./features/library/LibraryPage";
import { StudyView } from "./features/study/StudyView";
import { Wordbook } from "./features/vocabulary/Wordbook";
import { Quiz } from "./features/quiz/Quiz";
import { GenerationToast } from "./features/quiz/GenerationToast";
import { LegalPage } from "./features/legal/LegalPage";
import { ProfilePage } from "./features/profile/ProfilePage";
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
  const [infoPage, setInfoPage] = useState<InfoPage | null>(null);

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
  if (configured && !workspace.session) return infoPage
    ? <div className="auth-with-footer"><LegalPage page={infoPage} onBack={() => setInfoPage(null)} /><SiteFooter onOpen={setInfoPage} /></div>
    : <div className="auth-with-footer"><AuthScreen /><SiteFooter onOpen={setInfoPage} /></div>;

  return (
    <div className="app-shell">
      <AppHeader
        view={workspace.view}
        hasCurrent={Boolean(workspace.current)}
        configured={configured}
        session={workspace.session}
        onView={(view) => { setInfoPage(null); workspace.setView(view); }}
        onSignOut={() => { void supabase?.auth.signOut({ scope: "local" }); }}
      />

      {quizGeneration.generationJob && (
        <GenerationToast
          job={quizGeneration.generationJob}
          onStop={quizGeneration.stopQuizGeneration}
          onOpen={quizGeneration.openGeneratedQuiz}
          onDismiss={() => quizGeneration.setGenerationJob(null)}
        />
      )}

      {!infoPage && workspace.view === "library" && (
        <LibraryPage
          documents={workspace.documents}
          folders={workspace.folders}
          onOpen={workspace.openDocument}
          onUpload={(folderId = null) => { setUploadFolderId(folderId); workspace.setView("upload"); }}
          onCreateFolder={workspace.createFolder}
          onRenameFolder={workspace.renameFolder}
          onDeleteFolder={workspace.deleteFolder}
          onMoveDocument={workspace.moveDocumentToFolder}
          />
      )}

      {!infoPage && workspace.view === "upload" && workspace.session && (
        <UploadPanel
          userId={workspace.session.user.id}
          folderId={uploadFolderId}
          onCreated={workspace.addDocumentAndOpen}
          onCancel={() => workspace.setView("library")}
        />
      )}

      {!infoPage && workspace.current && workspace.view === "study" && (
        <StudyView
          doc={workspace.current}
          words={workspace.words}
          progress={workspace.progress}
          onSaveWord={workspace.saveWord}
          onDeleteWord={workspace.deleteWord}
          onProgress={workspace.saveProgress}
        />
      )}

      {!infoPage && workspace.current && workspace.view === "words" && (
        <Wordbook
          words={workspace.words}
          progress={workspace.progress}
          onUpdate={workspace.updateWord}
          onDelete={workspace.deleteWord}
          onStudy={() => workspace.setView("study")}
        />
      )}

      {!infoPage && workspace.current && workspace.view === "quiz" && (
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


      {!infoPage && workspace.session && workspace.view === "profile" && (
        <ProfilePage
          session={workspace.session}
          analytics={workspace.learningAnalytics}
          onBack={() => workspace.setView("library")}
        />
      )}

      {infoPage && <LegalPage page={infoPage} onBack={() => setInfoPage(null)} />}

      {!infoPage && <MobileBottomNav
        view={workspace.view}
        hasCurrent={Boolean(workspace.current)}
        onView={(view) => { setInfoPage(null); workspace.setView(view); }}
      />}

      <SiteFooter onOpen={setInfoPage} />
    </div>
  );
}
