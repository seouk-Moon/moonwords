import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      items: {
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
      },
    },
  },
};

async function callGemini(prompt: string, schema: Record<string, unknown>) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.7-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are an expert English reading teacher for Korean learners. Return only valid JSON matching the schema. Preserve every English sentence exactly except harmless whitespace. Korean explanations must be natural, accurate, and concise." }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini 요청 실패 (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("");
  if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
  return JSON.parse(text);
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

Deno.serve(async (request) => {
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

    if (body.action !== "analyze" || typeof body.text !== "string" || body.text.length < 40) {
      return Response.json({ error: "분석할 본문이 필요합니다." }, { status: 400, headers: cors });
    }
    if (body.text.length > 120_000) {
      return Response.json({ error: "본문은 120,000자 이하로 올려 주세요." }, { status: 400, headers: cors });
    }
    const prompt = `제목: ${body.title || "제목 없음"}\n\n아래 영어 본문을 한국 학습자용 학습 데이터로 분석하세요. 번역과 어휘 분석을 반드시 같은 작업에서 함께 수행하세요.\n- 원문 전체를 누락 없이 자연스러운 문장 단위로 분리하고 1부터 연속 ID를 부여합니다.\n- english에는 원문 문장을 보존하고 korean에는 그 문장만 자연스럽게 번역합니다.\n- 의미 단락을 3~8개 section으로 묶고 각 sentence의 paragraph에 section id를 넣습니다.\n- 각 문장을 번역할 때 한국 학습자가 선택할 가능성이 높은 어려운 단어, 내용어, 구동사와 숙어를 보통 8~10개 keywords로 함께 만듭니다. 짧은 문장은 필요한 만큼만 만듭니다.\n- keyword.word는 원문에 실제 나온 형태와 철자를 그대로 쓰고, meaning은 해당 문장에서 사용된 뜻만 간결한 한국어로 씁니다. 관사, 대명사, be/do/have 같은 매우 기초적인 기능어는 제외합니다.\n- topic, 한국어 summary, 글의 전개를 보여주는 한국어 structure를 작성합니다.\n- 내용 이해 객관식 문제를 5개 만들고 options는 4개, answer는 0부터 시작하는 정답 index입니다.\n\n본문:\n${body.text}`;
    const analysis = await callGemini(prompt, analysisSchema);
    return Response.json({ analysis }, { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." },
      { status: 500, headers: cors },
    );
  }
});
