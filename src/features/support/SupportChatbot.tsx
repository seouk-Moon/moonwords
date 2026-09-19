import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { View } from "../../app-types";
import { getFunctionErrorMessage } from "../../lib/function-error";
import { supabase } from "../../lib/supabase";

type SupportContext = {
  view: View | "auth" | "legal" | "loading";
  configured: boolean;
  signedIn: boolean;
  documentId?: string;
  documentTitle?: string;
  sentenceCount?: number;
  documentSentences?: Array<{ english: string; korean: string }>;
};

type SupportMode = "support" | "document";

type SupportReply = {
  text: string;
  action?: { label: string; href: string };
};

type ChatMessage = SupportReply & {
  id: number;
  role: "assistant" | "user";
  mode: SupportMode;
  documentId?: string;
};

const supportQuickTopics = [
  "문장 수가 안 맞아요",
  "PDF·OCR 도움",
  "Gemini 503 오류",
  "제목·폴더 사용법",
];

const documentQuickTopics = [
  "이 글의 핵심 내용을 알려줘",
  "글의 주장과 근거를 정리해줘",
  "어려운 표현을 설명해줘",
  "시험에 나올 부분은 어디야?",
];

const viewNames: Record<SupportContext["view"], string> = {
  auth: "로그인",
  legal: "서비스 안내",
  loading: "학습실 준비",
  library: "내 본문",
  upload: "본문 추가",
  study: "본문 학습",
  words: "단어장",
  quiz: "퀴즈",
  profile: "프로필",
};

const includesAny = (source: string, keywords: string[]) => keywords.some((keyword) => source.includes(keyword));

export function getSupportReply(question: string, context: SupportContext): SupportReply {
  const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
  const currentDocument = context.documentTitle
    ? `현재 본문 ‘${context.documentTitle}’은 분석 데이터 기준 ${context.sentenceCount ?? 0}문장입니다.\n\n`
    : "";

  if (includesAny(normalized, ["문장 수", "문장수", "개수", "번호", "누락", "안 보여", "안보여", "59", "29", "멈춰"])) {
    return {
      text: `${currentDocument}문장 번호가 중간에서 끝나거나 상단 개수보다 적게 보이던 문제를 보정했습니다. 이제 AI가 번호를 반복하거나 잘못된 문단 번호를 주더라도 화면 번호는 1부터 전체 문장 수까지 이어지고, 모든 문장이 본문에 표시됩니다.\n\n배포 후 이 페이지를 새로고침해 확인해 주세요.`,
    };
  }

  if (includesAny(normalized, ["ocr", "pdf", "스캔", "화질", "텍스트 추출", "글자 추출"])) {
    return {
      text: "PDF에 선택 가능한 글자가 있으면 바로 추출하고, 글자가 없거나 깨진 페이지만 화질 보정 후 OCR을 실행합니다. 그래서 선명한 PDF에는 불필요한 보정을 하지 않습니다.\n\n추출한 텍스트는 ‘Moonwords로 보내기’로 본문 추가 화면에 그대로 이어집니다. OCR은 브라우저에서 처리되며 최대 30페이지까지 지원합니다.",
      action: { label: "PDF 텍스트 추출기 열기", href: "./pdf-extractor.html" },
    };
  }

  if (includesAny(normalized, ["503", "gemini", "제미나이", "혼잡", "서버 오류", "ai 오류", "요청 실패"])) {
    return {
      text: "Gemini 503은 대개 모델 서버의 일시적인 혼잡 응답입니다. Moonwords는 같은 요청을 자동 재시도한 뒤 대체 모델도 순서대로 시도합니다.\n\n계속 실패하면 ① 잠시 뒤 다시 시도 ② Supabase Edge Function의 GEMINI_API_KEY 확인 ③ 수정된 process-document 함수를 다시 배포 순서로 확인해 주세요. 이미 만든 본문 데이터는 사라지지 않습니다.",
    };
  }

  if (includesAny(normalized, ["본문 삭제", "글 삭제", "자료 삭제"])) {
    return {
      text: "내 본문 화면에서 삭제할 카드 아래쪽의 ‘삭제’를 누른 뒤 확인 창에서 ‘본문 영구 삭제’를 선택하세요. 연결된 단어장·진도·퀴즈 기록과 업로드 원본도 함께 정리되며 되돌릴 수 없습니다.",
    };
  }

  if (includesAny(normalized, ["제목", "이름 바꾸", "폴더", "순서", "정렬", "이동"])) {
    return {
      text: "본문 제목은 본문 학습 화면 위쪽의 ‘제목 변경’에서 수정할 수 있습니다. 폴더 순서는 내 본문 화면에서 이동 버튼으로 바꿀 수 있고, 문서는 원하는 폴더로 이동할 수 있습니다.\n\n폴더 순서 기능이 처음이라면 제공된 Supabase migration SQL을 한 번 적용해야 합니다.",
    };
  }

  if (includesAny(normalized, ["난이도", "레벨", "cefr", "a1", "a2", "b1", "b2", "c1", "c2"])) {
    return {
      text: "본문 난이도는 CEFR 한 가지 척도로 표시합니다. A1(입문) → A2(초급) → B1(중급) → B2(중상급) → C1(고급) → C2(최상급) 순서입니다. 기존 본문의 Beginner·Intermediate·Advanced 같은 표기도 화면에서 가장 가까운 CEFR 단계로 자동 변환됩니다.",
    };
  }

  if (includesAny(normalized, ["문제", "퀴즈", "10개", "추가 생성"])) {
    return {
      text: "퀴즈 화면의 문제 추가에서 한 번에 최대 10개까지 만들 수 있습니다. 기존 문제는 유지되고 새 문제만 중복을 피해 추가됩니다.",
    };
  }

  if (includesAny(normalized, ["듣기", "재생", "일시정지", "음성", "소리"])) {
    return {
      text: "본문 위 재생 버튼은 전체 듣기, 각 문장의 재생 버튼은 한 문장 듣기입니다. 재생 중 같은 버튼을 누르면 일시정지되고, 다시 누르면 이어서 재생됩니다. 브라우저에서 소리가 차단됐다면 사이트의 소리 권한도 확인해 주세요.",
    };
  }

  if (includesAny(normalized, ["업로드", "본문 추가", "붙여넣", "파일 올리", "학습지 만들기"])) {
    return {
      text: "내 본문에서 ‘새 본문’을 누른 뒤 파일을 올리거나 영어 텍스트를 붙여 넣고 ‘AI 학습지 만들기’를 누르세요. PDF 추출기에서 보낸 글은 본문 추가 화면에 자동으로 채워집니다.",
    };
  }

  if (includesAny(normalized, ["로그인", "회원", "계정", "비밀번호", "로그아웃"])) {
    return {
      text: context.signedIn
        ? "현재 로그인되어 있습니다. 프로필은 오른쪽 위 사용자 버튼에서 열 수 있고, 로그아웃은 헤더 또는 프로필의 보안 메뉴에서 할 수 있습니다."
        : "이메일과 비밀번호로 로그인해 주세요. 로그인이 반복해서 풀리면 브라우저의 사이트 데이터 차단 여부와 Supabase 인증 URL 설정을 확인해 주세요.",
    };
  }

  if (includesAny(normalized, ["현재", "상태", "어디", "화면", "진단"])) {
    const configuration = context.configured ? "Supabase 연결 설정됨" : "데모 모드";
    const account = context.signedIn ? "로그인됨" : "로그인 안 됨";
    const document = context.documentTitle
      ? `현재 본문: ${context.documentTitle} (${context.sentenceCount ?? 0}문장)`
      : "현재 열린 본문 없음";
    return { text: `현재 화면: ${viewNames[context.view]}\n연결: ${configuration} · ${account}\n${document}` };
  }

  if (includesAny(normalized, ["안녕", "도움", "뭐 할", "사용법"])) {
    return { text: "반가워요. 문장 수 불일치, PDF·OCR, Gemini 503, 본문 제목, 폴더 순서, 퀴즈, 듣기 문제를 물어보세요." };
  }

  return {
    text: "아직 그 질문에 맞는 자동 해결 안내를 찾지 못했어요. 오류 문구나 증상을 조금 더 구체적으로 적어 주세요. 예: ‘Gemini 503’, ‘문장이 29에서 멈춤’, ‘스캔 PDF 글자가 안 나옴’",
  };
}

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.5A3.5 3.5 0 0 1 8 2h8a3.5 3.5 0 0 1 3.5 3.5v7A3.5 3.5 0 0 1 16 16H9l-4.5 4v-4.7A3.5 3.5 0 0 1 2 12V5.5Z" />
      <path d="M7.5 8.8h.01M12 8.8h.01M16.5 8.8h.01" />
    </svg>
  );
}

const buildNumberedDocumentText = (sentences: SupportContext["documentSentences"]) => (sentences ?? [])
  .map((sentence, index) => `[${index + 1}번 문장] ${sentence.english}\n한국어 번역: ${sentence.korean}`)
  .join("\n\n")
  .slice(0, 120_000);

export function SupportChatbot({ context }: { context: SupportContext }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SupportMode>("support");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingRequest, setPendingRequest] = useState<{ requestId: number; documentId: string } | null>(null);
  const nextMessageId = useRef(1);
  const activeRequest = useRef(0);
  const latestDocumentId = useRef(context.documentId);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pageLabel = useMemo(() => viewNames[context.view], [context.view]);
  const visibleMessages = useMemo(() => messages.filter((message) => (
    message.mode === mode && (mode === "support" || message.documentId === context.documentId)
  )), [context.documentId, messages, mode]);
  const quickTopics = mode === "support" ? supportQuickTopics : documentQuickTopics;
  const greeting = mode === "support"
    ? "안녕하세요! Moonwords 문제 해결 도우미예요. 어떤 기능이 잘 안 되는지 편하게 적어 주세요."
    : context.documentTitle
      ? `현재 본문 ‘${context.documentTitle}’을 바탕으로 답할게요. 내용, 문장, 표현을 무엇이든 물어보세요.`
      : "본문 질문을 하려면 먼저 내 본문에서 학습할 글을 열어 주세요.";
  const documentIsAnswering = pendingRequest?.documentId === context.documentId;
  const inputBusy = mode === "document" && documentIsAnswering;

  useEffect(() => {
    latestDocumentId.current = context.documentId;
  }, [context.documentId]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    messagesEndRef.current?.scrollIntoView({ block: "end" });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [documentIsAnswering, mode, open, visibleMessages.length]);

  const appendAssistant = (reply: SupportReply, selectedMode: SupportMode, documentId?: string) => {
    setMessages((current) => [...current, {
      id: nextMessageId.current++,
      role: "assistant",
      mode: selectedMode,
      documentId,
      ...reply,
    }]);
  };

  const ask = async (value: string) => {
    const question = value.trim();
    if (!question || (mode === "document" && documentIsAnswering)) return;
    const selectedMode = mode;
    const selectedDocumentId = context.documentId;
    const userMessage: ChatMessage = {
      id: nextMessageId.current++,
      role: "user",
      mode: selectedMode,
      documentId: selectedDocumentId,
      text: question,
    };
    setMessages((current) => [...current, userMessage]);
    setDraft("");

    if (selectedMode === "support") {
      appendAssistant(getSupportReply(question, context), selectedMode);
      return;
    }

    const documentText = buildNumberedDocumentText(context.documentSentences);
    if (!selectedDocumentId || !context.documentTitle || documentText.length < 40) {
      appendAssistant({ text: "현재 열린 본문이 없습니다. 내 본문에서 학습할 글을 연 뒤 다시 질문해 주세요." }, selectedMode, selectedDocumentId);
      return;
    }
    if (!context.signedIn || !supabase) {
      appendAssistant({ text: "본문 AI 질문은 로그인 후 사용할 수 있습니다. 문제 해결 도움말은 로그인 없이도 계속 이용할 수 있어요." }, selectedMode, selectedDocumentId);
      return;
    }

    const history = messages
      .filter((message) => message.mode === "document" && message.documentId === selectedDocumentId)
      .slice(-8)
      .map((message) => ({ role: message.role, text: message.text.slice(0, 1_200) }));
    const requestId = ++activeRequest.current;
    setPendingRequest({ requestId, documentId: selectedDocumentId });
    try {
      const response = await supabase.functions.invoke("process-document", {
        body: {
          action: "study-chat",
          title: context.documentTitle,
          text: documentText,
          question,
          history,
        },
      });
      if (response.error) throw new Error(await getFunctionErrorMessage(response.error));
      const answer = String(response.data?.answer ?? "").trim();
      if (!answer) throw new Error("답변이 비어 있습니다.");
      if (activeRequest.current === requestId && latestDocumentId.current === selectedDocumentId) {
        appendAssistant({ text: answer }, selectedMode, selectedDocumentId);
      }
    } catch (error) {
      if (activeRequest.current === requestId && latestDocumentId.current === selectedDocumentId) {
        const message = error instanceof Error ? error.message : "본문 질문에 답하지 못했습니다.";
        appendAssistant({ text: `본문 답변을 만들지 못했습니다. ${message}` }, selectedMode, selectedDocumentId);
      }
    } finally {
      setPendingRequest((current) => current?.requestId === requestId ? null : current);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(draft);
  };

  return (
    <div className={`support-chatbot ${open ? "is-open" : ""}`}>
      {open && (
        <section id="moonwords-support-chat" className="support-chat-panel" role="dialog" aria-label="Moonwords 도움말 및 본문 질문 챗봇" aria-modal="false">
          <header className="support-chat-header">
            <span className="support-chat-avatar">MW</span>
            <div><b>Moonwords 챗봇</b><small><i /> {pageLabel} 화면 안내 가능</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="도움말 챗봇 접기">×</button>
          </header>

          <div className="support-chat-modes" role="tablist" aria-label="챗봇 대화 종류">
            <button type="button" role="tab" aria-selected={mode === "support"} className={mode === "support" ? "active" : ""} onClick={() => setMode("support")}>문제 해결</button>
            <button type="button" role="tab" aria-selected={mode === "document"} className={mode === "document" ? "active" : ""} onClick={() => setMode("document")}>본문 질문</button>
          </div>

          <div className="support-chat-messages" aria-live="polite">
            <div className="support-message assistant">
              <span className="support-message-avatar">M</span>
              <div><p>{greeting}</p></div>
            </div>
            {visibleMessages.map((message) => (
              <div className={`support-message ${message.role}`} key={message.id}>
                {message.role === "assistant" && <span className="support-message-avatar">M</span>}
                <div>
                  <p>{message.text}</p>
                  {message.action && <a href={message.action.href}>{message.action.label} →</a>}
                </div>
              </div>
            ))}
            {documentIsAnswering && mode === "document" && (
              <div className="support-message assistant support-message-typing" role="status">
                <span className="support-message-avatar">M</span>
                <div><i /><i /><i /><span>본문을 확인하는 중</span></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="support-quick-topics" aria-label="빠른 질문">
            {quickTopics.map((topic) => <button type="button" key={topic} disabled={inputBusy} onClick={() => { void ask(topic); }}>{topic}</button>)}
          </div>

          <form className="support-chat-form" onSubmit={submit}>
            <input
              ref={inputRef}
              value={draft}
              maxLength={300}
              disabled={inputBusy}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={mode === "support" ? "문제나 오류를 입력하세요" : "현재 본문에 대해 질문하세요"}
              aria-label={mode === "support" ? "문제 해결 질문" : "현재 본문 질문"}
            />
            <button type="submit" disabled={!draft.trim() || inputBusy} aria-label="질문 보내기">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" /></svg>
            </button>
          </form>
          <small className="support-chat-privacy">{mode === "support" ? "자동 도움말 · 입력 내용은 서버로 전송되지 않아요" : "본문 질문 · 현재 본문과 최근 대화를 Gemini에 전송해요"}</small>
        </section>
      )}

      <button
        type="button"
        className="support-chat-launcher"
        onClick={() => setOpen((current) => !current)}
        aria-controls="moonwords-support-chat"
        aria-expanded={open}
        aria-label={open ? "도움말 챗봇 접기" : "Moonwords 챗봇 열기"}
      >
        {open ? <span aria-hidden="true">×</span> : <ChatBubbleIcon />}
        {!open && <b>도움말</b>}
      </button>
    </div>
  );
}
