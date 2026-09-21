"use client";

import { useEffect, useRef, useState } from "react";
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
import { SupportChatbot } from "./features/support/SupportChatbot";
import { LegalPage } from "./features/legal/LegalPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { useStudyWorkspace } from "./hooks/useStudyWorkspace";
import { useQuizGeneration } from "./hooks/useQuizGeneration";
import type { View } from "./app-types";
import {
  clearPendingPdfTransfer,
  readPendingPdfTransfer,
  type PdfTextTransfer,
} from "./pdf-extractor/transfer";

type AppProps = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

export default function App({ supabaseUrl, supabasePublishableKey }: AppProps = {}) {
  configureSupabase(supabaseUrl, supabasePublishableKey);
  const configured = cloudConfigured;
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [infoPage, setInfoPage] = useState<InfoPage | null>(null);
  const [pdfTransfer, setPdfTransfer] = useState<PdfTextTransfer | null>(null);
  const pdfTransferOpenedRef = useRef(false);

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
  const workspaceLoading = workspace.loading;
  const workspaceSession = workspace.session;
  const setWorkspaceView = workspace.setView;

  useEffect(() => {
    const timeout = window.setTimeout(() => setPdfTransfer(readPendingPdfTransfer()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!pdfTransfer || workspaceLoading || !workspaceSession || pdfTransferOpenedRef.current) return;
    pdfTransferOpenedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      setUploadFolderId(null);
      setInfoPage(null);
      setWorkspaceView("upload");
      clearPendingPdfTransfer();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pdfTransfer, workspaceLoading, workspaceSession, setWorkspaceView]);

  const discardPdfTransfer = () => {
    pdfTransferOpenedRef.current = true;
    setPdfTransfer(null);
    clearPendingPdfTransfer();
  };

  const navigateToView = (view: View) => {
    setInfoPage(null);
    if (view !== "upload") discardPdfTransfer();
    workspace.setView(view);
  };

  const openManualUpload = (folderId: string | null = null) => {
    discardPdfTransfer();
    setUploadFolderId(folderId);
    workspace.setView("upload");
  };

  if (workspace.loading) {
    return <div className="loading-screen"><Logo /><p>내 학습실을 여는 중…</p><SupportChatbot context={{ view: "loading", configured, signedIn: false }} /></div>;
  }
  if (configured && !workspace.session) return (
    <div className="auth-with-footer">
      {infoPage ? <LegalPage page={infoPage} onBack={() => setInfoPage(null)} /> : <AuthScreen />}
      <SupportChatbot context={{ view: infoPage ? "legal" : "auth", configured, signedIn: false }} />
      <SiteFooter onOpen={setInfoPage} />
    </div>
  );

  return (
    <div className="app-shell">
      <AppHeader
        view={workspace.view}
        hasCurrent={Boolean(workspace.current)}
        configured={configured}
        session={workspace.session}
        onView={navigateToView}
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
          onUpload={openManualUpload}
          onCreateFolder={workspace.createFolder}
          onRenameFolder={workspace.renameFolder}
          onDeleteFolder={workspace.deleteFolder}
          onDeleteDocument={workspace.deleteDocument}
          onMoveDocument={workspace.moveDocumentToFolder}
          onMoveFolder={workspace.moveFolder}
          />
      )}

      {!infoPage && workspace.view === "upload" && workspace.session && (
        <UploadPanel
          key={pdfTransfer ? `pdf-${pdfTransfer.createdAt}` : "manual-upload"}
          userId={workspace.session.user.id}
          folderId={uploadFolderId}
          initialTitle={pdfTransfer?.title}
          initialText={pdfTransfer?.text}
          importedFromPdfTool={Boolean(pdfTransfer)}
          onCreated={(document) => {
            discardPdfTransfer();
            workspace.addDocumentAndOpen(document);
          }}
          onCancel={() => {
            navigateToView("library");
          }}
        />
      )}

      {!infoPage && workspace.current && workspace.view === "study" && (
        <StudyView
          key={workspace.current.id}
          doc={workspace.current}
          words={workspace.words}
          progress={workspace.progress}
          onSaveWord={workspace.saveWord}
          onDeleteWord={workspace.deleteWord}
          onProgress={workspace.saveProgress}
          onRenameDocument={workspace.renameDocument}
          onFullListeningComplete={workspace.recordFullListeningCompleted}
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
          goals={workspace.dailyGoals}
          onGoalsChange={workspace.updateDailyGoals}
          onBack={() => navigateToView("library")}
        />
      )}

      {infoPage && <LegalPage page={infoPage} onBack={() => setInfoPage(null)} />}

      {!infoPage && <MobileBottomNav
        view={workspace.view}
        hasCurrent={Boolean(workspace.current)}
        onView={navigateToView}
      />}

      <SupportChatbot context={{
        view: infoPage ? "legal" : workspace.view,
        configured,
        signedIn: Boolean(workspace.session),
        documentId: workspace.current?.id,
        documentTitle: workspace.current?.title,
        sentenceCount: workspace.current?.analysis.sentences.length,
        documentSentences: workspace.current?.analysis.sentences,
      }} />

      <SiteFooter onOpen={setInfoPage} />
    </div>
  );
}
