"use client";

import { useEffect, useRef, useState } from "react";
import { cloudConfigured, configureSupabase } from "./lib/supabase";
import { AppHeader } from "./components/layout/AppHeader";
import { MobileBottomNav } from "./components/layout/MobileBottomNav";
import { SiteFooter, type InfoPage } from "./components/layout/SiteFooter";
import { Logo } from "./components/brand/Logo";
import { AuthScreen } from "./features/auth/AuthScreen";
import { UploadPanel } from "./features/upload/UploadPanel";
import { LibraryPage } from "./features/library/LibraryPage";
import { DEFAULT_LIBRARY_LOCATION } from "./features/library/library-location";
import { StudyView } from "./features/study/StudyView";
import { Wordbook } from "./features/vocabulary/Wordbook";
import { Quiz } from "./features/quiz/Quiz";
import { GenerationToast } from "./features/quiz/GenerationToast";
import { SupportChatbot } from "./features/support/SupportChatbot";
import { LegalPage } from "./features/legal/LegalPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { MoonGrowthCard } from "./features/progress/MoonGrowthCard";
import { MoonRewardToast } from "./features/progress/MoonRewardToast";
import { useStudyWorkspace } from "./hooks/useStudyWorkspace";
import { useWorkspaceHistory } from "./hooks/useWorkspaceHistory";
import { signOutThisBrowser, useDeviceSession } from "./hooks/useDeviceSession";
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
  const [uploadMode, setUploadMode] = useState<"file" | "photo">("file");
  const [libraryLocation, setLibraryLocation] = useState(DEFAULT_LIBRARY_LOCATION);
  const [infoPage, setInfoPage] = useState<InfoPage | null>(null);
  const [pdfTransfer, setPdfTransfer] = useState<PdfTextTransfer | null>(null);
  const pdfTransferOpenedRef = useRef(false);

  const workspace = useStudyWorkspace(configured);
  const deviceSession = useDeviceSession(workspace.session);
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
  useWorkspaceHistory({
    owner: workspace.session?.user.id ?? (configured ? "guest" : "demo"),
    ready: !workspace.loading,
    location: {
      view: workspace.view,
      documentId: ["study", "words", "quiz"].includes(workspace.view) ? workspace.current?.id ?? null : null,
      infoPage, library: libraryLocation,
      uploadFolderId: workspace.view === "upload" ? uploadFolderId : null,
      uploadMode: workspace.view === "upload" ? uploadMode : "file",
    },
    restore: async (target, isCurrent) => {
      workspace.cancelPendingOpen();
      setInfoPage(target.infoPage);
      setLibraryLocation(target.library);
      setUploadFolderId(target.uploadFolderId);
      setUploadMode(target.uploadMode);
      if (target.documentId && target.documentId !== workspace.current?.id) {
        const document = workspace.documents.find(item => item.id === target.documentId);
        if (!document) { workspace.setView("library"); return; }
        let unavailable = false;
        try { await workspace.openDocument(document, () => { unavailable = true; }); }
        catch { unavailable = true; }
        if (!isCurrent()) return;
        if (unavailable) { workspace.setView("library"); return; }
      }
      if (isCurrent()) workspace.setView(target.view);
    },
  });

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

  const openManualUpload = (folderId: string | null = null, mode: "file" | "photo" = "file") => {
    discardPdfTransfer();
    setUploadFolderId(folderId);
    setUploadMode(mode);
    workspace.setView("upload");
  };

  const openSentenceFromMoon = (sentenceNumber: number) => {
    if (!workspace.current || !Number.isFinite(sentenceNumber) || sentenceNumber < 1) return;
    setInfoPage(null);
    workspace.setView("study");
    let attempts = 0;
    const reveal = () => {
      const element = document.querySelector<HTMLElement>(`[data-sentence-index="${sentenceNumber - 1}"]`);
      if (!element && attempts < 8) {
        attempts += 1;
        window.setTimeout(reveal, 80);
        return;
      }
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("sentence-jump-highlight");
      window.setTimeout(() => element.classList.remove("sentence-jump-highlight"), 1800);
    };
    window.setTimeout(reveal, 40);
  };

  if (workspace.loading || deviceSession.checking) {
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
        streak={workspace.learningAnalytics.currentStreak}
        dailyComplete={workspace.learningAnalytics.today.qualified}
        onView={navigateToView}
        onSignOut={() => { void signOutThisBrowser(); }}
      />

      {quizGeneration.generationJob && (
        <GenerationToast
          job={quizGeneration.generationJob}
          onStop={quizGeneration.stopQuizGeneration}
          onOpen={quizGeneration.openGeneratedQuiz}
          onDismiss={() => quizGeneration.setGenerationJob(null)}
        />
      )}

      {!infoPage && workspace.view === "library" && <div className="moon-home"><MoonGrowthCard
        analytics={workspace.learningAnalytics}
        goals={workspace.dailyGoals}
        ready={workspace.analyticsReady}
        onOpenProfile={() => navigateToView("profile")}
      /></div>}

      {!infoPage && workspace.view === "library" && (
        <LibraryPage
          documents={workspace.documents}
          folders={workspace.folders}
          onOpen={workspace.openDocument}
          onCreateCollection={workspace.createWordbookCollection}
          onUpload={openManualUpload}
          onPhotoUpload={(folderId) => openManualUpload(folderId, "photo")}
          onCreateFolder={workspace.createFolder}
          onRenameFolder={workspace.renameFolder}
          onDeleteFolder={workspace.deleteFolder}
          onDeleteDocument={workspace.deleteDocument}
          onMoveDocument={workspace.moveDocumentToFolder}
          location={libraryLocation}
          onLocationChange={setLibraryLocation}
          />
      )}

      {!infoPage && workspace.view === "upload" && workspace.session && (
        <UploadPanel
          key={pdfTransfer ? `pdf-${pdfTransfer.createdAt}` : "manual-upload"}
          userId={workspace.session.user.id}
          documents={workspace.documents}
          learningEvents={workspace.learningEvents}
          quizAttempts={workspace.quizAttempts}
          onPracticeAnswer={workspace.recordGenerationPractice}
          folderId={uploadFolderId}
          initialMode={uploadMode}
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

      {!infoPage && workspace.current && workspace.view !== "words" && workspace.collectionSyncNotice && <p className="drive-message" role="status">{workspace.collectionSyncNotice}</p>}

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
          onUpdateAnalysis={workspace.updateDocumentAnalysis}
          onUpdateSentence={workspace.updateSentence}
          onDeleteSentence={workspace.deleteSentence}
          onFullListeningComplete={workspace.recordFullListeningCompleted}
        />
      )}

      {!infoPage && workspace.current && workspace.view === "words" && (
        <Wordbook
          key={workspace.current.id}
          onAdd={workspace.addManualWord}
          document={workspace.current}
          onCollectionApplied={workspace.openDocument}
          syncNotice={workspace.collectionSyncNotice}
          words={workspace.words}
          progress={workspace.progress}
          onUpdate={workspace.updateWord}
          onDelete={workspace.deleteWord}
          onStudy={() => workspace.setView("study")}
          onProgress={workspace.saveProgress}
          onQuiz={() => workspace.setView("quiz")}
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
          analyticsReady={workspace.analyticsReady}
          goals={workspace.dailyGoals}
          onGoalsChange={workspace.updateDailyGoals}
          onBack={() => navigateToView("library")}
        />
      )}

      {infoPage && <LegalPage page={infoPage} onBack={() => setInfoPage(null)} />}

      {workspace.session && <MoonRewardToast
        userId={workspace.session.user.id}
        dateKey={workspace.learningAnalytics.today.dateKey}
        complete={workspace.learningAnalytics.today.qualified}
        ready={workspace.analyticsReady}
        streak={workspace.learningAnalytics.currentStreak}
      />}

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
      }} onOpenSentence={openSentenceFromMoon} />

      <SiteFooter onOpen={setInfoPage} />
    </div>
  );
}
