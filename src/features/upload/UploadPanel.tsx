import { MaterialFileInputs, type MaterialFile } from "./MaterialFileInputs";
import "../study/class-exercises.css";
import { readClassNotes } from "./class-materials";
import { validateClassExercises } from "../study/class-exercises";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  extractDocumentFromFile,
  normalizePastedText,
  type DocumentExtractionProgress,
} from "../../lib/file-parsers";
import { getFunctionErrorMessage } from "../../lib/function-error";
import { uid } from "../../lib/app-utils";
import { normalizeNewDocumentAnalysis } from "../../lib/analysis-normalization";
import { supabase } from "../../lib/supabase";
import type { DocumentAnalysis, StudyDocument, VocabularyItem, LearningEvent, QuizAttempt } from "../../types";
import { PhotoTextCapture } from "./PhotoTextCapture";
import { preserveExamSource } from "./exam-source";
import { buildGenerationPractice, type PracticeQuestion } from "./generation-practice";
import { GenerationPractice } from "./GenerationPractice";

const normalizeForMark = (value: string) => value
  .toLowerCase()
  .replace(/[“”‘’"']/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const applySourceMarks = (analysis: DocumentAnalysis, fragments: string[]): DocumentAnalysis => {
  if (!fragments.length) return analysis;
  const normalizedFragments = fragments.map(normalizeForMark).filter((value) => value.length >= 8);
  if (!normalizedFragments.length) return analysis;

  return {
    ...analysis,
    sentences: analysis.sentences.map((sentence) => {
      const sentenceText = normalizeForMark(sentence.english);
      const marked = normalizedFragments.some((fragment) =>
        sentenceText.includes(fragment) || fragment.includes(sentenceText),
      );
      return marked ? { ...sentence, marked: true } : sentence;
    }),
  };
};

type BlankIssue = {
  id: number;
  start: number;
  end: number;
  token: string;
  context: string;
};

type PreparedDocument = {
  text: string;
  markedFragments: string[];
  imageDataUrl?: string;
  compact?: boolean;
  notesText?: string; noteImages?: string[]; notesOnly?: boolean;
};

const findBlankIssues = (text: string): BlankIssue[] => {
  const matches = [...text.matchAll(/_{3,}|＿{3,}|□{2,}|\.{5,}/g)].slice(0, 30);
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const contextStart = Math.max(0, start - 90);
    const contextEnd = Math.min(text.length, end + 90);
    return {
      id: index,
      start,
      end,
      token: match[0],
      context: `${contextStart > 0 ? "…" : ""}${text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim()}${contextEnd < text.length ? "…" : ""}`,
    };
  });
};

const applyBlankAnswers = (
  text: string,
  issues: BlankIssue[],
  answers: Record<number, { value: string; keepBlank: boolean }>,
) => {
  let next = text;
  [...issues].sort((a, b) => b.start - a.start).forEach((issue) => {
    const answer = answers[issue.id];
    if (!answer || answer.keepBlank || !answer.value.trim()) return;
    next = `${next.slice(0, issue.start)}${answer.value.trim()}${next.slice(issue.end)}`;
  });
  return next;
};

const describeExtractionProgress = (progress: DocumentExtractionProgress) => {
  if (progress.stage === "reading") return `PDF 글자를 확인하는 중 (${progress.currentPage}/${progress.totalPages})…`;
  if (progress.stage === "ocr-loading") return "스캔 PDF를 위한 OCR 엔진을 준비하는 중…";
  if (progress.stage === "ocr-rendering") return `PDF 화질을 보정하는 중 (${progress.currentPage}/${progress.totalPages})…`;
  return `OCR로 ${progress.currentPage}페이지를 읽는 중 (${Math.max(1, Math.round(progress.progress * 100))}%)…`;
};

export function UploadPanel({
  userId,
  documents = [], learningEvents = [], quizAttempts = [], onPracticeAnswer = () => {},
  folderId = null,
  initialMode = "file",
  initialTitle = "",
  initialText = "",
  importedFromPdfTool = false,
  onCreated,
  onCancel,
}: {
  userId: string;
  documents?: StudyDocument[]; learningEvents?: LearningEvent[]; quizAttempts?: QuizAttempt[]; onPracticeAnswer?: (q:PracticeQuestion, correct:boolean)=>void;
  folderId?: string | null;
  initialMode?: "file" | "photo";
  initialTitle?: string;
  initialText?: string;
  importedFromPdfTool?: boolean;
  onCreated: (doc: StudyDocument) => void;
  onCancel: () => void;
}) {
  const [inputMode, setInputMode] = useState<"file" | "text" | "photo">(initialText ? "text" : initialMode);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [completedDocument,setCompletedDocument] = useState<StudyDocument|null>(null);
  const [showPractice,setShowPractice] = useState(false);
  const [practiceWords,setPracticeWords] = useState<VocabularyItem[]>([]);
  const [practiceLoading,setPracticeLoading] = useState(false);
  const delivered = useRef(false);const mounted = useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const recentIds=documents.filter(d=>d.last_studied_at&&!d.analysis.collection&&d.source_type!=="vocabulary_collection").sort((a,b)=>Date.parse(b.last_studied_at!)-Date.parse(a.last_studied_at!)).slice(0,8).map(d=>d.id).join(',');
  useEffect(()=>{let active=true;setPracticeWords([]);setPracticeLoading(Boolean(supabase&&recentIds));if(supabase&&recentIds)void supabase.from('vocabulary').select('*').in('document_id',recentIds.split(',')).limit(2000).then(result=>{if(active){if(!result.error)setPracticeWords(result.data as VocabularyItem[]);setPracticeLoading(false);}});return()=>{active=false;};},[userId,recentIds]);
  const practiceQuestions=useMemo(()=>buildGenerationPractice(documents,practiceWords,learningEvents,quizAttempts),[documents,practiceWords,learningEvents,quizAttempts]);
  const beginPractice=()=>{delivered.current=false;setCompletedDocument(null);setShowPractice(true);};
  const continueToDocument=()=>{if(!completedDocument||delivered.current||!mounted.current)return;delivered.current=true;onCreated(completedDocument);};

  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);
  const [materials,setMaterials] = useState<MaterialFile[]>([{file:null,role:""},{file:null,role:""}]);
  const notesFile = materials.find(item=>item.role==="notes")?.file ?? null;
  const file = materials.find(item=>item.role==="original")?.file ?? null;
  const invalidMaterials = !materials[0].file || materials.some(item=>item.file && !item.role);
  const [classInstructions,setClassInstructions] = useState("");
  const [classExercises,setClassExercises] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedDocument | null>(null);
  const [blankIssues, setBlankIssues] = useState<BlankIssue[]>([]);
  const [blankAnswers, setBlankAnswers] = useState<Record<number, { value: string; keepBlank: boolean }>>({});

  const analyzeWithRetry = async (documentTitle: string, originalText: string, source: PreparedDocument) => {
    if (!supabase) throw new Error("Supabase 연결이 필요합니다.");
    const response = await supabase.functions.invoke("process-document", {
      body: { action: "analyze", title: documentTitle, text: originalText, questionCount: 10, imageDataUrl: source.imageDataUrl, compactReading: source.compact === true, notesText:source.notesText, noteImages:source.noteImages, notesOnly:source.notesOnly, classInstructions, classExercises },
    });
    if(response.error) throw new Error(await getFunctionErrorMessage(response.error));
    if (!response.data?.analysis || !Array.isArray(response.data.analysis.sentences) || !response.data.analysis.sentences.length) throw new Error("분석 결과에 읽을 수 있는 영어 본문이 없어요. 원문과 파일 종류를 확인해 주세요.");
    return response.data;
  };

  const finalizeDocument = async (source: PreparedDocument) => {
    setBusy(true);
    setError("");
    try {
      const client = supabase;
      if (!client) throw new Error("Supabase 연결이 필요합니다.");
      if (notesFile && source.notesText === undefined) {
        const notes = await readClassNotes(notesFile,setStatus);
        source = {...source,notesText:notes.text,noteImages:notes.images};
      }
      const originalText = source.text;
      const sourceFile = inputMode === "file" ? file : null;
      const documentId = uid();
      let sourcePath: string | null = null;


      setStatus("번역과 학습 문제를 만드는 중…");
      const responseData = await analyzeWithRetry(title || sourceFile?.name || "새 영어 본문", originalText, source);
      const normalizedAnalysis = normalizeNewDocumentAnalysis(responseData.analysis as DocumentAnalysis);
      const analysis = preserveExamSource(applySourceMarks(normalizedAnalysis, source.markedFragments), originalText, source.compact, Boolean(source.imageDataUrl) || source.notesOnly === true);
      if (classExercises) analysis.class_exercises = validateClassExercises(normalizedAnalysis.class_exercises, analysis.sentences.map(s=>s.english).join(" "));
      analysis.class_materials = {notesText:source.notesText || "",notesName:notesFile?.name || "",originalName:sourceFile?.name || (source.imageDataUrl ? "촬영 본문" : ""),instructions:classInstructions};
      if (sourceFile) {
        setStatus("원본 파일을 저장하는 중…");
        const requestedExtension = sourceFile.name.split(".").pop()?.toLowerCase() ?? "bin";
        const safeExtension = requestedExtension.replace(/[^a-z0-9]/g, "") || "bin";
        sourcePath = `${userId}/${documentId}/source.${safeExtension}`;
        const upload = await client.storage.from("source-files").upload(sourcePath, sourceFile);
        if (upload.error) throw upload.error;
      }

      const payload = {
        id: documentId,
        user_id: userId,
        ...(folderId ? { folder_id: folderId } : {}),
        title: title.trim() || sourceFile?.name.replace(/\.[^.]+$/, "") || (analysis.source_exam?.questions[0]?.label ? `모의고사 ${analysis.source_exam.questions[0].label}번 · ${analysis.source_exam.questionType}` : analysis.topic || "새 영어 본문"),
        source_name: sourceFile?.name ?? null,
        source_type: sourceFile?.name.split(".").pop()?.toLowerCase() ?? "text",
        source_file_path: sourcePath,
        original_text: analysis.source_exam?.rawText || originalText,
        analysis,
      };
      const inserted = await client.from("documents").insert(payload).select().single();
      if (inserted.error) {
        if (folderId && inserted.error.message.includes("folder_id")) {
          throw new Error("선택한 폴더에 저장하지 못했습니다. 폴더를 새로고침한 뒤 다시 시도해 주세요.");
        }
        throw inserted.error;
      }
      if (mounted.current) setCompletedDocument(inserted.data as StudyDocument);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "본문을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const create = async () => {
    if(inputMode === "file" && invalidMaterials){setError("첫 번째 파일을 올리고 각 파일의 원문/필기본 종류를 선택해 주세요.");return;}
    beginPractice();
    setBusy(true);
    setError("");
    try {
      setStatus("본문을 읽는 중…");
      if (inputMode === "file" && !file && notesFile) {
        const notes = await readClassNotes(notesFile,setStatus);
        await finalizeDocument({text:notes.text.length>=40 ? notes.text : "필기본 이미지에서 실제 영어 본문과 한글 필기를 읽어 분석해 주세요. 보이지 않는 본문은 창작하지 마세요.", markedFragments:[],notesText:notes.text,noteImages:notes.images,notesOnly:true});
        return;
      }
      if(inputMode === "file" && file && /\.(png|jpe?g|webp)$/i.test(file.name)) {
        const image=await readClassNotes(file,setStatus);
        await finalizeDocument({text:image.text.length>=40?image.text:"첨부 원문 이미지에서 영어 지문과 한글 문제, 보기를 빠짐없이 읽어 주세요. 보이지 않는 글은 창작하지 마세요.",markedFragments:[],imageDataUrl:image.images[0],compact:true});
        return;
      }
      const extracted = inputMode === "file" && file
        ? await extractDocumentFromFile(file, { onProgress: (progress) => setStatus(describeExtractionProgress(progress)) })
        : { text: normalizePastedText(text), markedFragments: [] as string[] };
      const source: PreparedDocument = { text: extracted.text, markedFragments: extracted.markedFragments };
      const issues = findBlankIssues(source.text);
      if (issues.length) {
        setShowPractice(false);
        setPrepared(source);
        setBlankIssues(issues);
        setBlankAnswers(Object.fromEntries(issues.map((issue) => [issue.id, { value: "", keepBlank: false }])));
        setBusy(false);
        setStatus("");
        return;
      }
      await finalizeDocument(source);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "본문을 처리하지 못했습니다.");
      setBusy(false);
      setStatus("");
    }
  };

  const resolveBlanksAndContinue = async () => {
    if (!prepared) return;
    const unresolved = blankIssues.some((issue) => {
      const answer = blankAnswers[issue.id];
      return !answer?.keepBlank && !answer?.value.trim();
    });
    if (unresolved) {
      setError("각 빈칸에 내용을 입력하거나 ‘비워두기’를 선택해 주세요.");
      return;
    }
    setError("");
    const nextText = applyBlankAnswers(prepared.text, blankIssues, blankAnswers);
    setPrepared(null);
    setBlankIssues([]);
    beginPractice();
    await finalizeDocument({ ...prepared, text: nextText });
  };

  if (prepared && blankIssues.length) {
    return (
      <section className="upload-card blank-review-card">
        <button className="back-button" onClick={() => { setPrepared(null); setBlankIssues([]); setError(""); }}>← 본문 입력으로</button>
        <span className="section-kicker">CHECK BLANKS</span>
        <h1>빈칸을 확인해 주세요</h1>
        <p>본문에서 빈칸처럼 보이는 부분을 찾았습니다. 들어갈 내용을 적거나 그대로 비워둘 수 있어요.</p>
        <div className="blank-review-list">
          {blankIssues.map((issue, index) => {
            const answer = blankAnswers[issue.id] ?? { value: "", keepBlank: false };
            return (
              <article className="blank-review-item" key={`${issue.start}-${issue.id}`}>
                <span>{index + 1}</span>
                <div>
                  <p>{issue.context}</p>
                  <input
                    value={answer.value}
                    disabled={answer.keepBlank}
                    onChange={(event) => setBlankAnswers((current) => ({ ...current, [issue.id]: { value: event.target.value, keepBlank: false } }))}
                    placeholder="이 빈칸에 들어갈 내용"
                  />
                  <button
                    type="button"
                    className={answer.keepBlank ? "active" : ""}
                    onClick={() => setBlankAnswers((current) => ({ ...current, [issue.id]: { value: "", keepBlank: !answer.keepBlank } }))}
                  >
                    {answer.keepBlank ? "✓ 그대로 비워두기" : "그대로 비워두기"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <button className="text-button blank-all-skip" type="button" onClick={() => setBlankAnswers(Object.fromEntries(blankIssues.map((issue) => [issue.id, { value: "", keepBlank: true }])))}>모두 그대로 비워두기</button>
        {error && <p className="error-message">{error}</p>}
        <button className="primary-button wide" disabled={busy} onClick={() => { void resolveBlanksAndContinue(); }}>{busy ? "학습지 생성 중…" : "확인 완료 · 학습지 만들기"}</button>
      </section>
    );
  }

  return (
    <section className="upload-card">
      {showPractice && <GenerationPractice questions={practiceLoading?[]:practiceQuestions} ready={Boolean(completedDocument)} status={status || (photoBusy?"한국어·영어 본문과 문제를 읽고 있어요…":"본문을 준비하는 중…")} error={error} onContinue={continueToDocument} onDismissError={()=>{setShowPractice(false);setError("");}} onAnswer={onPracticeAnswer}/>}
      <button className="back-button" onClick={onCancel}>← 내 본문</button>
      <span className="section-kicker">NEW READING</span>
      <h1>새 본문을 학습지로 만들기</h1>
      <p>영어 원문을 올리면 문장별 자연스러운 번역과 단어 뜻, 구조 분석, 이해 문제를 자동 생성합니다.</p>
      {folderId && <p className="upload-folder-note">📁 현재 선택한 폴더에 저장됩니다.</p>}
      {importedFromPdfTool && (
        <div className="pdf-import-notice">
          <div><b>PDF 텍스트를 가져왔습니다.</b><span>내용을 확인한 뒤 AI 학습지를 만들어 주세요.</span></div>
          <a href="./pdf-extractor.html">추출기 다시 열기</a>
        </div>
      )}
      <div className="segmented"><button disabled={busy || photoBusy} className={inputMode === "file" ? "active" : ""} onClick={() => setInputMode("file")}>파일 올리기</button><button disabled={busy || photoBusy} className={inputMode === "photo" ? "active" : ""} onClick={() => setInputMode("photo")}>본문 추가</button><button disabled={busy || photoBusy} className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")}>텍스트 붙여넣기</button></div>
      <label className="field">제목 (선택)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: The Future of Space Travel" /></label>
      {inputMode === "photo" ? <PhotoTextCapture onError={message=>setError(message)} onBusyChange={value=>{setPhotoBusy(value);if(value){setError("");beginPractice();}}} onRecognized={async result => {
        setText(result.text);
        await finalizeDocument({text:result.text.length>=40?result.text:"첨부 원문 사진의 선택한 영역에서 영어 본문과 한글 질문, 보기를 읽고 정리해 주세요. 보이지 않는 글은 창작하지 마세요.",markedFragments:[],imageDataUrl:result.imageDataUrl,compact:true});
      }} /> : inputMode === "file" ? (
        <MaterialFileInputs values={materials} onChange={setMaterials} disabled={busy||photoBusy}/>
      ) : <><label className="field">영어 본문<textarea aria-label="영어 본문" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="영어 본문을 여기에 붙여 넣으세요…" /></label></>}
      <fieldset className="class-upload-options" disabled={busy || photoBusy}>
        <legend>수업 자료와 맞춤 출제</legend>
        <p>원문과 필기본 중 하나만 있어도 돼요. 사진 촬영과 함께 쓸 필기본은 먼저 선택해 주세요.</p>
        {inputMode!=="file" && <label className="field">함께 사용할 필기본 (선택)<input type="file" accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp" onChange={e=>setMaterials([{file:e.target.files?.[0]??null,role:"notes"},{file:null,role:""}])}/></label>}
        {inputMode!=="file" && notesFile && <button type="button" onClick={()=>setMaterials([{file:null,role:""},{file:null,role:""}])}>필기본 선택 해제 · {notesFile.name}</button>}
        <small>필기 PDF는 8쪽·20MB까지. 사진/PDF는 글씨와 표시를 AI에 함께 보내요. 읽기 어려운 손글씨는 조건란에 보충해 주세요.</small>
        <label className="field">수업에서 배운 조건 (선택)<textarea maxLength={2000} rows={3} value={classInstructions} onChange={e=>setClassInstructions(e.target.value)} placeholder="예: 5형식, 목적격 보어로 형용사 사용. 필기에서 흐린 부분도 여기에 적어 주세요." /></label>
        <label><input type="checkbox" checked={classExercises} onChange={e=>setClassExercises(e.target.checked)} /> 영영풀이 빈칸 + 조건 영작 문제 만들기</label>
      </fieldset>
      {status && <p className="processing"><i />{status}</p>}{error && <p className="error-message">{error}</p>}
      {inputMode !== "photo" && <button className="primary-button wide" disabled={busy || photoBusy || (inputMode === "file" ? invalidMaterials : text.trim().length < 40)} onClick={() => { void create(); }}>{busy ? "학습지 생성 중…" : "AI 학습지 만들기"}</button>}
      <a className="pdf-extractor-link" href="./pdf-extractor.html"><span>PDF</span><div><b>텍스트만 먼저 추출하고 싶나요?</b><small>별도 PDF 텍스트 추출기 열기</small></div><i aria-hidden="true">→</i></a>
    </section>
  );
}
