import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { StudyDocument } from '../../types';
import './collection-updates.css';
type Candidate = {id:string;word:string;meaning:string;source_sentence:string;translation:string;source_title:string};
const errorText=(message:string)=>/PGRST202|schema cache|does not exist/i.test(message)?'새 단어 확인을 사용하려면 동봉된 202610200001_collection_selected_updates.sql을 Supabase SQL Editor에서 실행해 주세요.':message;
export function CollectionUpdates({document,onApplied}:{document:StudyDocument;onApplied:(doc:StudyDocument)=>Promise<void>}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [candidates,setCandidates]=useState<Candidate[]>([]),[total,setTotal]=useState(0);
  const [selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const mounted=useRef(true),inFlight=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const read=async()=>{
    if(!supabase)throw new Error('로그인 후 원본 본문의 새 단어를 확인할 수 있어요.');
    const result=await supabase.rpc('list_vocabulary_collection_updates',{p_collection_id:document.id});
    if(result.error)throw new Error(errorText(result.error.message));
    if(mounted.current){setCandidates(result.data?.candidates??[]);setTotal(result.data?.totalCount??0);setSelected([]);}
  };
  const check=async()=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setOpen(true);setNotice('');
    try{await read();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'새 단어를 확인하지 못했어요.');}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  };
  const add=async()=>{
    if(inFlight.current||!selected.length||!supabase)return;
    inFlight.current=true;setBusy(true);setError('');
    try{
      const result=await supabase.rpc('import_vocabulary_collection_updates',{p_collection_id:document.id,p_word_ids:selected});
      if(result.error)throw new Error(errorText(result.error.message));
      if(!mounted.current)return;
      const {document:updated,addedCount=0,skippedCount=0}=result.data;
      await onApplied(updated);
      if(!mounted.current)return;
      setNotice(`${addedCount}개 단어를 추가했어요.${skippedCount?' 단어장 최대 5,000개에 도달해 일부를 추가하지 못했어요.':''}`);
      await read();
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'단어를 추가하지 못했어요.');}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  };
  return <section className="collection-updates" aria-label="통합단어장 새 단어 확인">
    <div className="collection-update-heading"><div><b>원본 본문에 단어를 더 저장했나요?</b><p>통합단어장을 만든 뒤 새로 저장한 단어 중 원하는 것만 골라 추가하세요.</p></div><button className="outline-button" disabled={busy} onClick={()=>void check()}>{busy?'확인 중…':'추가된 단어 확인하기'}</button></div>
    {notice&&<p role="status">{notice}</p>}
    {open&&<div className="collection-update-list">
      <div className="collection-update-actions"><strong>추가 가능한 단어 {total}개</strong><button disabled={busy} onClick={()=>{setOpen(false);setError('');}}>닫기</button></div>
      {error?<p role="alert">{error}</p>:<>
        {!busy&&!candidates.length&&<p>새로 추가할 단어가 없어요. 이미 들어 있는 같은 단어·뜻은 제외됩니다.</p>}
        {candidates.length>0&&<>
          <div className="collection-update-actions"><button disabled={busy} onClick={()=>setSelected(candidates.map(c=>c.id))}>전체 선택</button><button disabled={busy} onClick={()=>setSelected([])}>선택 해제</button></div>
          {total>candidates.length&&<p>한 번에 {candidates.length}개씩 확인해요. 추가 후 남은 단어를 다시 볼 수 있어요.</p>}
          <div className="collection-update-scroll">{candidates.map(c=><label key={c.id} className="collection-update-item"><input type="checkbox" disabled={busy} checked={selected.includes(c.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><span><strong>{c.word}</strong><b>{c.meaning}</b><small>원본 본문: {c.source_title}</small>{c.source_sentence&&<p lang="en">{c.source_sentence}</p>}{c.translation&&<small>{c.translation}</small>}</span></label>)}</div>
          <button className="primary-button" disabled={busy||!selected.length} onClick={()=>void add()}>선택한 {selected.length}개 추가하기</button>
          <p>선택하지 않은 단어는 추가되지 않아요. 나중에 다시 확인할 수 있어요.</p>
        </>}
      </>}
    </div>}
  </section>;
}
