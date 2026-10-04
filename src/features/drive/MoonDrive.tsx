import { useRef, useState } from "react";
import { driveClient } from "./drive-client";
import "./moon-drive.css";

type DriveFile = { id: string; name: string; size: number; ready: boolean; created_at: string };
type Listing = { files: DriveFile[]; used: number; capacity: number; maxFile: number };
const sizeLabel = (size: number) => size < 1024 ? `${size} B` : size < 1024 * 1024
  ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export function MoonDrive() {
  const [open, setOpen] = useState(true);
  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const request = async <T,>(body: Record<string, string> | FormData): Promise<T> => {
    if (!driveClient) throw new Error("드라이브를 사용하려면 Supabase 연결이 필요해요.");
    const result = await driveClient.functions.invoke("moon-drive", { body, headers: { "x-drive-code": code } });
    if (result.error) {
      let detail = "드라이브에 연결하지 못했어요. 서버 설정이나 네트워크를 확인해 주세요.";
      try { detail = (await result.error.context.json()).error || detail; } catch { /* transport failure */ }
      throw new Error(detail);
    }
    return result.data as T;
  };
  const refresh = async () => setListing(await request<Listing>({ action: "list" }));
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  };
  const lock = () => { setUnlocked(false); setCode(""); setListing(null); setDeleteId(null); setMessage(""); };

  return <section className="moon-drive" aria-label="Moon Drive">
    <button className="moon-drive-toggle" aria-expanded={open} aria-controls="moon-drive-content" onClick={() => setOpen(!open)}>
      <span><b>Moon Drive</b><small>파일을 보관하고 다시 내려받으세요</small></span><span>{open ? "접기 −" : "열기 +"}</span>
    </button>
    {open && <div id="moon-drive-content" className="moon-drive-content">
      {!unlocked ? <form className="drive-unlock" onSubmit={(event) => {
        event.preventDefault(); void run(async () => { await refresh(); setUnlocked(true); });
      }}>
        <label htmlFor="moon-drive-code">관리자가 정한 6자리 코드</label>
        <div><input id="moon-drive-code" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
          autoComplete="off" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required disabled={busy} placeholder="6자리 숫자" />
          <button disabled={busy || code.length !== 6}>{busy ? "확인 중…" : "드라이브 열기"}</button></div>
        <p>코드를 아는 사람만 파일을 올리고, 다운로드하고, 삭제할 수 있어요.</p>
      </form> : <>
        <div className="drive-toolbar"><span>보관 중 {listing?.files.length ?? 0}개</span><div>
          <button disabled={busy} onClick={() => void run(refresh)}>새로고침</button>
          <button disabled={busy} onClick={lock}>잠그기</button>
        </div></div>
        {listing && <div className="drive-capacity">
          <span>{sizeLabel(listing.used)} / {sizeLabel(listing.capacity)} 사용 · 남은 용량 {sizeLabel(Math.max(0, listing.capacity - listing.used))}</span>
          <progress max={listing.capacity} value={listing.used} aria-label="드라이브 사용 용량" />
        </div>}
        <div className="drive-upload">
          <p>원본 파일 그대로 보관 · 파일당 최대 {sizeLabel(listing?.maxFile ?? 20971520)}</p>
          <input ref={input} aria-label="업로드할 파일 선택" type="file" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]; if (!file) return;
            void run(async () => {
              try {
                if (file.size < 1) throw new Error("빈 파일은 올릴 수 없어요.");
                if (file.size > (listing?.maxFile ?? 20971520)) throw new Error("파일당 최대 20MB까지 올릴 수 있어요.");
                if (listing && file.size > listing.capacity - listing.used) throw new Error("남은 용량이 부족해요. 파일을 삭제한 뒤 올려 주세요.");
                const form = new FormData(); form.append("file", file);
                await request(form); await refresh(); setMessage("파일을 보관했어요.");
              } finally { if (input.current) input.current.value = ""; }
            });
          }} />
        </div>
        <input className="drive-search" aria-label="파일 이름 검색" placeholder="파일 이름 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <ul className="drive-file-list">
          {listing?.files.filter(file => file.name.toLowerCase().includes(search.toLowerCase())).map(file => <li key={file.id}>
            <div className="drive-file-info"><b>{file.name}</b><small>{sizeLabel(file.size)} · {new Date(file.created_at).toLocaleDateString("ko-KR")}{!file.ready && " · 업로드 미완료"}</small></div>
            <div className="drive-file-actions">
              {deleteId === file.id ? <><span>삭제할까요?</span>
                <button className="drive-danger" disabled={busy} onClick={() => void run(async () => {
                  await request({ action: "delete", id: file.id }); setDeleteId(null); await refresh(); setMessage("파일을 삭제했어요.");
                })}>삭제 확인</button><button disabled={busy} onClick={() => setDeleteId(null)}>취소</button></> : <>
                <button disabled={busy || !file.ready} onClick={() => void run(async () => {
                  const data = await request<{ url: string }>({ action: "download", id: file.id });
                  const a = document.createElement("a"); a.href = data.url; a.rel = "noopener"; a.click();
                })}>다운로드</button>
                <button className="drive-danger" disabled={busy} onClick={() => setDeleteId(file.id)}>삭제</button>
              </>}
            </div>
          </li>)}
        </ul>
        {listing?.files.length === 0 && <p className="drive-empty">아직 보관한 파일이 없어요. 위에서 첫 파일을 올려 주세요.</p>}
        {listing && listing.files.length > 0 && !listing.files.some(f => f.name.toLowerCase().includes(search.toLowerCase())) && <p>검색 결과가 없어요.</p>}
      </>}
      <p className="drive-message" role="status" aria-live="polite">{busy ? "처리 중…" : message}</p>
    </div>}
  </section>;
}
