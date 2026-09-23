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
  "학습시간·오늘 목표",
  "최근 학습 날짜",
  "챕터별 듣기",
  "PDF·OCR",
  "문의하는 방법",
  "문장 수가 안 맞아요",
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

const compactText = (value: string) => value.toLowerCase().normalize("NFKC").replace(/[^a-z0-9가-힣]+/g, "");
const textTokens = (value: string) => value.toLowerCase().normalize("NFKC").match(/[a-z0-9가-힣]+/g) ?? [];

const isOneEditAway = (first: string, second: string) => {
  if (first === second) return true;
  if (Math.abs(first.length - second.length) > 1) return false;
  let left = 0;
  let right = 0;
  let edits = 0;
  while (left < first.length && right < second.length) {
    if (first[left] === second[right]) {
      left += 1;
      right += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (first.length > second.length) left += 1;
    else if (second.length > first.length) right += 1;
    else {
      left += 1;
      right += 1;
    }
  }
  if (left < first.length || right < second.length) edits += 1;
  return edits <= 1;
};

const fuzzyTokenContains = (token: string, target: string) => {
  if (token.length < 3 || target.length < 3) return false;
  if (isOneEditAway(token, target)) return true;
  if (token.length < target.length) return false;
  const windowLengths = [target.length, target.length + 1];
  return windowLengths.some((windowLength) => {
    if (windowLength > token.length) return false;
    for (let start = 0; start + windowLength <= token.length; start += 1) {
      if (isOneEditAway(token.slice(start, start + windowLength), target)) return true;
    }
    return false;
  });
};

const includesAny = (source: string, keywords: string[]) => {
  const compact = compactText(source);
  const tokens = textTokens(source).map(compactText);
  return keywords.some((keyword) => {
    const target = compactText(keyword);
    if (!target) return false;
    if (compact.includes(target)) return true;
    if (target.length < 3) return false;
    return tokens.some((token) => fuzzyTokenContains(token, target));
  });
};

export function getSupportReply(question: string, context: SupportContext): SupportReply {
  const normalized = question.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
  const currentDocument = context.documentTitle
    ? `현재 본문 ‘${context.documentTitle}’은 분석 데이터 기준 ${context.sentenceCount ?? 0}문장입니다.\n\n`
    : "";

  if (includesAny(normalized, ["문장 수", "문장수", "개수", "번호", "누락", "안 보여", "안보여", "59", "29", "멈춰"])) {
    return {
      text: `${currentDocument}본문에서는 문장 번호가 1번부터 끝까지 이어지도록 표시됩니다. 번호가 이상하게 보이면 페이지를 새로고침한 뒤 다시 확인해 주세요.`,
    };
  }

  if (includesAny(normalized, ["학습시간", "시간기록", "시간 카운트", "시간안올라", "카운트안", "오늘 목표", "하루미션", "미션", "streak", "스트릭", "연속학습"])) {
    return {
      text: "학습시간은 본문·단어장·퀴즈 화면에서 실제로 활동한 시간을 짧은 간격으로 기록합니다. 프로필의 ‘오늘 미션’에서 전체 듣기·플래시카드·퀴즈 목표를 각각 바꿀 수 있고, 설정한 미션을 모두 끝낸 날이 streak로 인정됩니다. 날짜별 추이는 ‘상세 학습 기록 보기’를 눌러 확인하세요.",
    };
  }

  if (includesAny(normalized, ["챕터", "쳅터", "챕터 듣기", "챕터별", "문단 듣기", "챕터재생", "구간 듣기"])) {
    return {
      text: "본문 전체 듣기는 상단 재생 버튼을 사용하고, 특정 챕터만 들으려면 각 챕터 제목 오른쪽의 ‘챕터 듣기’를 누르세요. 같은 버튼으로 일시정지·계속 듣기가 가능합니다. 문장별 듣기도 기존처럼 사용할 수 있어요.",
    };
  }

  if (includesAny(normalized, ["최근 학습", "최근학습", "등록일", "등록 날짜", "학습 날짜", "날짜 표시", "날짜 정렬"])) {
    return {
      text: "내 본문의 날짜는 등록일이 아니라 ‘최근 학습’ 날짜입니다. 본문을 열거나 진도가 저장되면 최근 학습 시각이 갱신되고, 본문 목록도 최근에 공부한 자료가 먼저 보이도록 정렬됩니다. 아직 한 번도 학습하지 않은 자료는 ‘아직 학습 없음’으로 표시됩니다.",
    };
  }

  if (includesAny(normalized, ["문의", "제보", "issue", "issues", "new issue", "newissue", "깃허브 문의"])) {
    return {
      text: "화면 아래 ‘문의하기’에서 종류·제목·내용을 적고 ‘문의 화면 열기’를 누르면 됩니다.",
    };
  }

  if (includesAny(normalized, ["ocr", "pdf", "스캔", "화질", "텍스트 추출", "글자 추출"])) {
    return {
      text: "PDF에 선택 가능한 글자가 있으면 바로 추출하고, 글자가 없거나 깨진 페이지만 화질 보정 후 OCR을 실행합니다. 그래서 선명한 PDF에는 불필요한 보정을 하지 않습니다.\n\n추출한 텍스트는 ‘Moonwords로 보내기’로 본문 추가 화면에 그대로 이어집니다. OCR은 브라우저에서 영어와 한국어를 함께 인식하며 최대 30페이지까지 지원합니다.",
      action: { label: "PDF 텍스트 추출기 열기", href: "./pdf-extractor.html" },
    };
  }

  if (includesAny(normalized, ["503", "gemini", "제미나이", "혼잡", "서버 오류", "ai 오류", "요청 실패"])) {
    return {
      text: "일시적으로 AI 응답이 지연되거나 실패할 수 있어요. 잠시 뒤 같은 작업을 다시 시도해 주세요. 이미 저장된 본문과 학습 기록은 그대로 유지됩니다.",
    };
  }

  if (includesAny(normalized, ["본문 삭제", "글 삭제", "자료 삭제"])) {
    return {
      text: "내 본문 화면에서 삭제할 카드 아래쪽의 ‘삭제’를 누른 뒤 확인 창에서 ‘본문 영구 삭제’를 선택하세요. 연결된 단어장·진도·퀴즈 기록과 업로드 원본도 함께 정리되며 되돌릴 수 없습니다.",
    };
  }

  if (includesAny(normalized, ["제목", "이름 바꾸", "폴더", "순서", "정렬", "이동"])) {
    return {
      text: "본문 제목은 본문 학습 화면 위쪽의 ‘제목 변경’에서 수정할 수 있습니다. 폴더 순서는 내 본문 화면에서 이동 버튼으로 바꿀 수 있고, 문서는 원하는 폴더로 이동할 수 있습니다.",
    };
  }

  if (includesAny(normalized, ["난이도", "레벨", "cefr", "a1", "a2", "b1", "b2", "c1", "c2"])) {
    return {
      text: "본문 난이도는 CEFR 한 가지 척도로 표시합니다. A1(입문) → A2(초급) → B1(중급) → B2(중상급) → C1(고급) → C2(최상급) 순서입니다. 기존 본문의 Beginner·Intermediate·Advanced 같은 표기도 화면에서 가장 가까운 CEFR 단계로 자동 변환됩니다.",
    };
  }

  if (includesAny(normalized, ["퀴즈", "퀴즈 문제", "문제 생성", "문항 생성", "10개", "추가 생성"])) {
    return {
      text: "퀴즈 화면의 문제 추가에서 한 번에 최대 10개까지 만들 수 있습니다. 기존 문제는 유지되고 새 문제만 중복을 피해 추가됩니다.",
    };
  }

  if (includesAny(normalized, ["듣기", "재생", "일시정지", "음성", "소리"])) {
    return {
      text: "본문 위 재생 버튼은 전체 듣기, 각 챕터 제목 오른쪽 버튼은 챕터 듣기, 각 문장의 재생 버튼은 한 문장 듣기입니다. 재생 중 같은 버튼을 누르면 일시정지되고, 다시 누르면 이어서 재생됩니다. 브라우저에서 소리가 차단됐다면 사이트의 소리 권한도 확인해 주세요.",
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
    const configuration = context.configured ? "온라인 저장 사용 중" : "체험 모드";
    const account = context.signedIn ? "로그인됨" : "로그인 안 됨";
    const document = context.documentTitle
      ? `현재 본문: ${context.documentTitle} (${context.sentenceCount ?? 0}문장)`
      : "현재 열린 본문 없음";
    return { text: `현재 화면: ${viewNames[context.view]}\n연결: ${configuration} · ${account}\n${document}` };
  }

  if (includesAny(normalized, ["안녕", "도움", "뭐 할", "사용법"])) {
    return { text: "반가워요. 학습시간, 최근 학습 날짜, 챕터 듣기, PDF·OCR, 문의, 퀴즈를 물어보세요." };
  }

  return {
    text: `짧게 적어도 괜찮아요. 예: ‘학습시간’, ‘최근 학습’, ‘챕터 듣기’, ‘OCR’, ‘문의’, ‘퀴즈’. 현재 ${viewNames[context.view]} 화면에 맞춰 안내할게요.`,
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

const sentenceReferencePattern = /(\[?\s*\d{1,4}\s*번\s*문장\s*\]?)/g;

function ChatText({ text, onOpenSentence }: { text: string; onOpenSentence?: (sentenceNumber: number) => void }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());
  const renderInline = (line: string, keyPrefix: string) => line.split(sentenceReferencePattern).map((part, index) => {
    const match = part.match(/(\d{1,4})\s*번\s*문장/);
    if (!match || !onOpenSentence) return <span key={`${keyPrefix}-${index}`}>{part}</span>;
    const sentenceNumber = Number(match[1]);
    return <button type="button" className="support-sentence-link" key={`${keyPrefix}-${index}`} onClick={() => onOpenSentence(sentenceNumber)}>{part}</button>;
  });

  return <div className="support-message-content">{blocks.map((block, blockIndex) => {
    const lines = block.split("\n").filter((line) => line.trim());
    const listLike = lines.length > 1 && lines.every((line) => /^\s*(?:[-•]|\d+[.)])\s+/.test(line));
    if (listLike) {
      return <ul key={`block-${blockIndex}`}>{lines.map((line, lineIndex) => <li key={`line-${lineIndex}`}>{renderInline(line.replace(/^\s*(?:[-•]|\d+[.)])\s+/, ""), `${blockIndex}-${lineIndex}`)}</li>)}</ul>;
    }
    return <p key={`block-${blockIndex}`}>{lines.map((line, lineIndex) => <span className="support-text-line" key={`line-${lineIndex}`}>{renderInline(line, `${blockIndex}-${lineIndex}`)}</span>)}</p>;
  })}</div>;
}

export function SupportChatbot({ context, onOpenSentence }: { context: SupportContext; onOpenSentence?: (sentenceNumber: number) => void }) {
  const [open, setOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
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
    ? "안녕하세요. Moon이에요. 어떤 기능이 궁금한지 편하게 적어 주세요."
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
      if (event.key === "Escape") {
        if (fullScreen) setFullScreen(false);
        else setOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [documentIsAnswering, fullScreen, mode, open, visibleMessages.length]);

  useEffect(() => {
    if (!fullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [fullScreen]);

  const appendAssistant = (reply: SupportReply, selectedMode: SupportMode, documentId?: string) => {
    setMessages((current) => [...current, {
      id: nextMessageId.current++,
      role: "assistant",
      mode: selectedMode,
      documentId,
      ...reply,
    }]);
  };

  const cancelPendingAnswer = () => {
    if (!pendingRequest) return;
    activeRequest.current += 1;
    setPendingRequest(null);
    appendAssistant({ text: "답변 생성을 취소했어요." }, "document", pendingRequest.documentId);
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
      appendAssistant({ text: "본문 질문은 로그인 후 사용할 수 있어요." }, selectedMode, selectedDocumentId);
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
        appendAssistant({ text: `답변을 만들지 못했습니다.\n\n${message}` }, selectedMode, selectedDocumentId);
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
    <div className={`support-chatbot ${open ? "is-open" : ""} ${fullScreen ? "is-fullscreen" : ""}`}>
      {open && (
        <section id="moonwords-support-chat" className="support-chat-panel" role="dialog" aria-label="Moon 챗봇" aria-modal={fullScreen}>
          <header className="support-chat-header">
            <span className="support-chat-avatar">M</span>
            <div><b>Moon</b><small><i /> {pageLabel} 화면</small></div>
            <div className="support-chat-header-actions">
              <button type="button" onClick={() => setFullScreen((current) => !current)} aria-label={fullScreen ? "작은 화면으로 보기" : "전체 화면으로 보기"} title={fullScreen ? "작은 화면" : "전체 화면"}>{fullScreen ? "↙" : "↗"}</button>
              <button type="button" onClick={() => { setFullScreen(false); setOpen(false); }} aria-label="Moon 닫기">×</button>
            </div>
          </header>

          <div className="support-chat-modes" role="tablist" aria-label="대화 종류">
            <button type="button" role="tab" aria-selected={mode === "support"} className={mode === "support" ? "active" : ""} onClick={() => setMode("support")}>기능 질문</button>
            <button type="button" role="tab" aria-selected={mode === "document"} className={mode === "document" ? "active" : ""} onClick={() => setMode("document")}>본문 질문</button>
          </div>

          <div className="support-chat-messages" aria-live="polite">
            <div className="support-message assistant">
              <span className="support-message-avatar">M</span>
              <div><ChatText text={greeting} /></div>
            </div>
            {visibleMessages.map((message) => (
              <div className={`support-message ${message.role}`} key={message.id}>
                {message.role === "assistant" && <span className="support-message-avatar">M</span>}
                <div>
                  <ChatText text={message.text} onOpenSentence={message.role === "assistant" && message.mode === "document" && onOpenSentence ? (sentenceNumber) => { setFullScreen(false); setOpen(false); onOpenSentence(sentenceNumber); } : undefined} />
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
              placeholder={mode === "support" ? "궁금한 기능을 입력하세요" : "현재 본문에 대해 질문하세요"}
              aria-label={mode === "support" ? "기능 질문" : "현재 본문 질문"}
            />
            {inputBusy ? (
              <button type="button" className="support-cancel-answer" onClick={cancelPendingAnswer} aria-label="답변 생성 취소">■</button>
            ) : (
              <button type="submit" disabled={!draft.trim()} aria-label="질문 보내기">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" /></svg>
              </button>
            )}
          </form>
        </section>
      )}

      <button
        type="button"
        className="support-chat-launcher"
        onClick={() => { if (open) { setFullScreen(false); setOpen(false); } else setOpen(true); }}
        aria-controls="moonwords-support-chat"
        aria-expanded={open}
        aria-label={open ? "Moon 닫기" : "Moon 열기"}
      >
        {open ? <span aria-hidden="true">×</span> : <ChatBubbleIcon />}
        {!open && <b>Moon</b>}
      </button>
    </div>
  );
}
