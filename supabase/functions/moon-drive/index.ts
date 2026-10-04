import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-drive-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const maxFile = 20 * 1024 * 1024;
const bucket = "moon-drive";
const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "허용되지 않은 요청입니다." }, 405);
  const secret = Deno.env.get("MOON_DRIVE_CODE") ?? "";
  if (!/^\d{6}$/.test(secret)) return reply({ error: "드라이브 설정이 필요합니다. 관리자에게 문의해 주세요." }, 503);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const provided = req.headers.get("x-drive-code") ?? "";
    const [a, b] = await Promise.all([digest(provided.slice(0, 100)), digest(secret)]);
    let different = 0;
    for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
    const valid = /^\d{6}$/.test(provided) && different === 0;
    const gate = await admin.rpc("moon_drive_check_gate", { valid });
    if (gate.error) return reply({ error: "드라이브 데이터베이스 설정을 확인해 주세요." }, 503);
    if (!gate.data) return reply({ error: "코드 입력 실패가 많아 잠겼어요. 최대 10분 뒤 다시 시도해 주세요." }, 429);
    if (!valid) return reply({ error: "6자리 코드가 맞지 않아요." }, 403);

    const configured = Number(Deno.env.get("MOON_DRIVE_MAX_MB") ?? 200);
    const capacity = Math.floor((Number.isFinite(configured) ? Math.min(500, Math.max(1, configured)) : 200) * 1024 * 1024);
    const isUpload = req.headers.get("content-type")?.includes("multipart/form-data");
    if (isUpload) {
      const length = Number(req.headers.get("content-length"));
      if (length > maxFile + 65536) return reply({ error: "파일당 최대 20MB까지 올릴 수 있어요." }, 413);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size < 1 || file.size > maxFile)
        return reply({ error: "비어 있지 않은 20MB 이하 파일을 선택해 주세요." }, 400);
      const name = file.name.replace(/[\/\\\u0000-\u001f\u007f]/g, "_").trim().slice(0, 200) || "file";
      const id = crypto.randomUUID();
      const reservation = await admin.rpc("moon_drive_reserve", { file_id: id, file_name: name, file_size: file.size, capacity });
      if (reservation.error) return reply({ error: reservation.error.message.includes("capacity exceeded")
        ? "드라이브 용량이 가득 찼어요. 파일을 삭제한 뒤 올려 주세요." : reservation.error.message.includes("file count exceeded") ? "최대 500개까지 보관할 수 있어요. 파일을 삭제해 주세요." : "용량을 확보하지 못했어요." }, 409);
      const uploaded = await admin.storage.from(bucket).upload(id, file, { contentType: "application/octet-stream", upsert: false });
      if (uploaded.error) {
        await admin.from("moon_drive_files").delete().eq("id", id);
        return reply({ error: "업로드하지 못했어요. 다시 시도해 주세요." }, 500);
      }
      const marked = await admin.from("moon_drive_files").update({ ready: true }).eq("id", id);
      if (marked.error) {
        const removed = await admin.storage.from(bucket).remove([id]);
        if (!removed.error) await admin.from("moon_drive_files").delete().eq("id", id);
        return reply({ error: "파일 등록에 실패했어요. 새로고침해 확인해 주세요." }, 500);
      }
      return reply({ ok: true });
    }
    const body = await req.json();
    if (body.action === "list") {
      const result = await admin.from("moon_drive_files").select("id,name,size,ready,created_at").order("created_at", { ascending: false }).limit(1000);
      if (result.error) throw result.error;
      return reply({ files: result.data, used: result.data.reduce((n, f) => n + Number(f.size), 0), capacity, maxFile });
    }
    if (!["download", "delete"].includes(body.action) || !/^[0-9a-f-]{36}$/.test(String(body.id)))
      return reply({ error: "잘못된 요청입니다." }, 400);
    const found = await admin.from("moon_drive_files").select("id,name,ready").eq("id", body.id).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) return reply({ error: "이미 삭제된 파일이에요." }, 404);
    if (body.action === "download") {
      if (!found.data.ready) return reply({ error: "업로드가 완료되지 않은 파일이에요." }, 409);
      const signed = await admin.storage.from(bucket).createSignedUrl(body.id, 60, { download: found.data.name });
      if (signed.error) throw signed.error;
      return reply({ url: signed.data.signedUrl });
    }
    const removed = await admin.storage.from(bucket).remove([body.id]);
    if (removed.error) throw removed.error;
    const deleted = await admin.from("moon_drive_files").delete().eq("id", body.id);
    if (deleted.error) throw deleted.error;
    return reply({ ok: true });
  } catch {
    return reply({ error: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요." }, 500);
  }
});
