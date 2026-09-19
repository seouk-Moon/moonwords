import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const readingQuestionSchema = {
  type: "object",
  required: ["question", "options", "answer", "explanation"],
  properties: {
    question: { type: "string" },
    options: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: { type: "string" },
    },
    answer: { type: "integer" },
    explanation: { type: "string" },
  },
};

const analysisSchema = {
  type: "object",
  required: ["level", "topic", "summary", "structure", "sections", "sentences", "questions"],
  properties: {
    level: { type: "string" },
    topic: { type: "string" },
    summary: { type: "string" },
    structure: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        required: ["id", "label", "role"],
        properties: {
          id: { type: "integer" },
          label: { type: "string" },
          role: { type: "string" },
        },
      },
    },
    sentences: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "paragraph", "english", "korean", "keywords"],
        properties: {
          id: { type: "integer" },
          paragraph: { type: "integer" },
          english: { type: "string" },
          korean: { type: "string" },
          keywords: {
            type: "array",
            maxItems: 10,
            items: {
              type: "object",
              required: ["word", "meaning"],
              properties: {
                word: { type: "string" },
                meaning: { type: "string" },
              },
            },
          },
        },
      },
    },
    questions: {
      type: "array",
      items: readingQuestionSchema,
    },
  },
};

const transientGeminiStatuses = new Set([408, 429, 500, 502, 503, 504]);
const defaultGeminiModel = "gemini-3.8-flash";
const defaultFallbackModels = [defaultGeminiModel, "gemini-3.7-flash", "gemini-3.5-flash-lite"];

class GeminiUpstreamError extends Error {
  status: number;
  model: string;
  retryable: boolean;
  details: string;
  retryAfterMs: number;

  constructor(status: number, model: string, details: string, retryAfterMs = 0) {
    const message = status === 429
      ? "Gemini 요청 한도를 초과했습니다 (429). 잠시 후 다시 시도해 주세요."
      : status === 503
        ? "Gemini 서버가 일시적으로 혼잡합니다 (503). 자동 재시도와 대체 모델 호출에도 실패했습니다."
        : status === 404
          ? "설정된 Gemini 모델을 사용할 수 없습니다 (404). Edge Function의 모델 설정을 확인해 주세요."
          : status === 403
            ? "Gemini API 권한 또는 결제 설정을 확인해 주세요 (403)."
            : `Gemini 요청에 실패했습니다 (${status}). 잠시 후 다시 시도해 주세요.`;
    super(message);
    this.name = "GeminiUpstreamError";
    this.status = status;
    this.model = model;
    this.retryable = transientGeminiStatuses.has(status);
    this.details = details;
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const getGeminiModels = () => {
  const primary = Deno.env.get("GEMINI_MODEL")?.trim() || defaultGeminiModel;
  const configuredFallbacks = Deno.env.get("GEMINI_FALLBACK_MODELS");
  const fallbacks = configuredFallbacks === undefined
    ? defaultFallbackModels
    : configuredFallbacks.split(",").map((model: string) => model.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
};

const retryAfterMilliseconds = (response: Response) => {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
};

async function callGemini(prompt: string, schema: Record<string, unknown>) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const models = getGeminiModels();
  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: "You are an expert English reading teacher for Korean learners. Return only valid JSON matching the schema. Preserve every English sentence exactly except harmless whitespace. Korean explanations must be natural, accurate, and concise." }],
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.25,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  });
  let finalError: GeminiUpstreamError | null = null;
  let retryNumber = 0;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const attemptsForModel = modelIndex === 0 ? 2 : 1;

    for (let modelAttempt = 0; modelAttempt < attemptsForModel; modelAttempt += 1) {
      let response: Response | null = null;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: requestBody,
          },
        );
      } catch (error) {
        finalError = new GeminiUpstreamError(
          503,
          model,
          error instanceof Error ? error.message : "Gemini network request failed",
        );
      }

      if (response?.ok) {
        try {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text || "")
            .join("");
          if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
          return JSON.parse(text);
        } catch (error) {
          finalError = new GeminiUpstreamError(
            502,
            model,
            error instanceof Error ? error.message : "Gemini returned invalid JSON",
          );
        }
      } else if (response) {
        const details = (await response.text()).slice(0, 1_200);
        finalError = new GeminiUpstreamError(
          response.status,
          model,
          details,
          retryAfterMilliseconds(response),
        );
      }

      if (!finalError) continue;
      console.warn("Gemini request failed", {
        model: finalError.model,
        status: finalError.status,
        retryable: finalError.retryable,
        details: finalError.details,
      });

      const modelCanFallback = finalError.retryable || finalError.status === 404;
      if (!modelCanFallback) throw finalError;

      const retrySameModel = finalError.status !== 404 && modelAttempt + 1 < attemptsForModel;
      const hasFallbackModel = modelIndex + 1 < models.length;
      if (!retrySameModel && !hasFallbackModel) break;

      const exponentialDelay = Math.min(8_000, 800 * (2 ** retryNumber));
      const jitter = Math.floor(Math.random() * 500);
      await sleep(Math.max(finalError.retryAfterMs, exponentialDelay + jitter));
      retryNumber += 1;
      if (!retrySameModel) break;
    }
  }

  throw finalError ?? new Error("Gemini 요청에 실패했습니다.");
}

async function callGeminiTts(text: string) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  const model = Deno.env.get("GEMINI_TTS_MODEL") || "gemini-3.1-flash-tts-preview";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model,
      input: `Read the English transcript exactly as written. Use clear, natural American English at a calm study pace. Do not add or omit any words.\n\nTRANSCRIPT:\n${text}`,
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Kore" }] },
      store: false,
    }),
  });
  if (!response.ok) throw new Error(`Gemini 음성 생성 실패 (${response.status}): ${await response.text()}`);
  const data = await response.json();
  const audio = data.output_audio || data.steps?.flatMap((step: { content?: Array<{ type?: string }> }) => step.content || []).find((content: { type?: string }) => content.type === "audio");
  if (!audio?.data) throw new Error("Gemini 음성 응답이 비어 있습니다.");
  return {
    audio: audio.data as string,
    mimeType: (audio.mime_type || "audio/l16") as string,
    sampleRate: Number(audio.sample_rate || 24_000),
    channels: Number(audio.channels || 1),
  };
}

const requestedQuestionCount = (value: unknown, fallback = 5) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.floor(parsed))) : fallback;
};

const validateSourceText = (text: unknown) => {
  if (typeof text !== "string" || text.length < 40) return "분석할 본문이 필요합니다.";
  if (text.length > 120_000) return "본문은 120,000자 이하로 올려 주세요.";
  return "";
};

<<<<<<< HEAD
type GeneratedSection = {
  id: number;
  label: string;
  role: string;
  [key: string]: unknown;
};

type GeneratedSentence = {
  id: number;
  paragraph: number;
  english: string;
  korean: string;
  keywords: unknown[];
  [key: string]: unknown;
};

type GeneratedAnalysis = {
  sections?: GeneratedSection[];
  sentences?: GeneratedSentence[];
  [key: string]: unknown;
};

/**
 * Gemini가 긴 본문에서 문장 id를 섹션마다 다시 시작하거나, 존재하지 않는
 * paragraph id를 반환해도 저장 데이터는 항상 1..N / 유효한 section id가 되게 한다.
 */
const normalizeGeneratedAnalysis = (analysis: GeneratedAnalysis) => {
  const sourceSections = Array.isArray(analysis.sections) && analysis.sections.length
    ? analysis.sections
    : [{ id: 1, label: "본문", role: "전체 본문" }];
  const sectionIdMap = new Map<number, number>();
  const sections = sourceSections.map((section, index) => {
    const normalizedId = index + 1;
    if (Number.isInteger(section.id) && !sectionIdMap.has(section.id)) {
      sectionIdMap.set(section.id, normalizedId);
    }
    return {
      ...section,
      id: normalizedId,
      label: String(section.label || `구간 ${normalizedId}`),
      role: String(section.role || "본문 내용"),
    };
  });

  let activeSectionId = 1;
  const sourceSentences = Array.isArray(analysis.sentences) ? analysis.sentences : [];
  const sentences = sourceSentences.map((sentence, index) => {
    const mappedSectionId = sectionIdMap.get(sentence.paragraph);
    if (mappedSectionId !== undefined) {
      activeSectionId = Math.max(activeSectionId, mappedSectionId);
    } else if (
      Number.isInteger(sentence.paragraph) &&
      sentence.paragraph >= 1 &&
      sentence.paragraph <= sections.length
    ) {
      activeSectionId = Math.max(activeSectionId, sentence.paragraph);
    }
    return {
      ...sentence,
      id: index + 1,
      paragraph: activeSectionId,
      keywords: Array.isArray(sentence.keywords) ? sentence.keywords : [],
    };
  });

  return { ...analysis, sections, sentences };
};

=======
>>>>>>> 9d6fce52c3a2276842e97472a9abda1ab4984a91
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = request.headers.get("Authorization") || "";
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers: cors });
    }

    const body = await request.json();
    if (body.action === "tts") {
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 1_200) {
        return Response.json({ error: "음성으로 만들 영어 본문은 1,200자 이하로 보내 주세요." }, { status: 400, headers: cors });
      }
      const audio = await callGeminiTts(body.text.trim());
      return Response.json(audio, { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (body.action === "define") {
      const result = await callGemini(
        `다음 영어 문장에서 선택한 단어나 구의 문맥상 한국어 뜻만 간결하게 설명하세요.\n선택: ${body.word}\n영어 문장: ${body.sentence}\n문장 번역: ${body.translation}`,
        {
          type: "object",
          required: ["meaning"],
          properties: { meaning: { type: "string" } },
        },
      );
      return Response.json(result, { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (body.action === "generate-questions") {
      const validationError = validateSourceText(body.text);
      if (validationError) return Response.json({ error: validationError }, { status: 400, headers: cors });

      const questionCount = requestedQuestionCount(body.questionCount);
      const existingQuestions = Array.isArray(body.existingQuestions)
        ? body.existingQuestions.filter((question: unknown) => typeof question === "string").slice(0, 100)
        : [];
      const result = await callGemini(
        `제목: ${body.title || "제목 없음"}\n\n아래 영어 본문만 바탕으로 한국 학습자용 내용 이해 객관식 문제를 정확히 ${questionCount}개 새로 만드세요.\n- options는 항상 4개이며 answer는 0부터 시작하는 정답 index입니다.\n- 세부 사실, 핵심 주장, 추론, 글의 흐름을 고르게 확인하세요.\n- 정답과 오답 선택지는 서로 명확히 구분되도록 작성하세요.\n- 기존 문제와 같은 질문이나 사실상 같은 질문은 만들지 마세요.\n\n기존 문제:\n${existingQuestions.length ? existingQuestions.map((question: string) => `- ${question}`).join("\n") : "없음"}\n\n본문:\n${body.text}`,
        {
          type: "object",
          required: ["questions"],
          properties: {
            questions: {
              type: "array",
              minItems: questionCount,
              maxItems: questionCount,
              items: readingQuestionSchema,
            },
          },
        },
      );
      return Response.json(
        { questions: result.questions },
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (body.action !== "analyze") {
      return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400, headers: cors });
    }
    const validationError = validateSourceText(body.text);
    if (validationError) return Response.json({ error: validationError }, { status: 400, headers: cors });

    const questionCount = requestedQuestionCount(body.questionCount);
    const prompt = `제목: ${body.title || "제목 없음"}\n\n아래 영어 본문을 한국 학습자용 학습 데이터로 분석하세요. 번역과 어휘 분석을 반드시 같은 작업에서 함께 수행하세요.\n- 원문 전체를 누락 없이 자연스러운 문장 단위로 분리하고 1부터 연속 ID를 부여합니다.\n- english에는 원문 문장을 보존하고 korean에는 그 문장만 자연스럽게 번역합니다.\n- 의미 단락을 3~8개 section으로 묶고 각 sentence의 paragraph에 section id를 넣습니다.\n- 각 문장을 번역할 때 한국 학습자가 선택할 가능성이 높은 어려운 단어, 내용어, 구동사와 숙어를 보통 8~10개 keywords로 함께 만듭니다. 짧은 문장은 필요한 만큼만 만듭니다.\n- keyword.word는 원문에 실제 나온 형태와 철자를 그대로 쓰고, meaning은 해당 문장에서 사용된 뜻만 간결한 한국어로 씁니다. 관사, 대명사, be/do/have 같은 매우 기초적인 기능어는 제외합니다.\n- topic, 한국어 summary, 글의 전개를 보여주는 한국어 structure를 작성합니다.\n- 내용 이해 객관식 문제를 ${questionCount}개 만들고 options는 4개, answer는 0부터 시작하는 정답 index입니다.\n\n본문:\n${body.text}`;
<<<<<<< HEAD
    const analysis = normalizeGeneratedAnalysis(await callGemini(prompt, analysisSchema));
=======
    const analysis = await callGemini(prompt, analysisSchema);
>>>>>>> 9d6fce52c3a2276842e97472a9abda1ab4984a91
    return Response.json({ analysis }, { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    const status = error instanceof GeminiUpstreamError ? error.status : 500;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
        retryable: error instanceof GeminiUpstreamError ? error.retryable : false,
      },
      { status: status >= 400 && status <= 599 ? status : 500, headers: cors },
    );
  }
});
