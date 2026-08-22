export const getFunctionErrorMessage = async (error: unknown) => {
  const fallback = error instanceof Error ? error.message : "AI 처리 요청에 실패했습니다.";
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.clone !== "function") return fallback;
  try {
    const body = await context.clone().json() as { error?: string; message?: string };
    return body.error || body.message || fallback;
  } catch {
    try {
      return (await context.clone().text()) || fallback;
    } catch {
      return fallback;
    }
  }
};
