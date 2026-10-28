import {useEffect,useRef,useState, type DragEvent, type PointerEvent} from 'react';
import type {DocumentFolder} from '../../types';
import {canMoveFolder,folderLabel,folderPath,type LibraryItem} from './folder-tree';
import './library-organizer.css';
const MIME='application/x-moonwords-library';
export function useLibraryGestures(open:(item:LibraryItem)=>void){
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),start=useRef({x:0,y:0}),suppress=useRef(false);
 const clear=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 useEffect(()=>clear,[]);
 return (item:LibraryItem)=>({draggable:true,
  onDragStart:(e:DragEvent)=>{clear();suppress.current=true;e.dataTransfer.setData(MIME,JSON.stringify(item));e.dataTransfer.effectAllowed='move';},
  onDragEnd:()=>{setTimeout(()=>{suppress.current=false;},0);},
  onContextMenu:(e:React.MouseEvent)=>{e.preventDefault();clear();suppress.current=true;open(item);},
  onPointerDown:(e:PointerEvent)=>{suppress.current=false;if(e.button!==0|| (e.target as HTMLElement).closest('select,input,textarea,[data-item-menu]'))return;start.current={x:e.clientX,y:e.clientY};clear();timer.current=setTimeout(()=>{suppress.current=true;open(item);},550);},
  onPointerMove:(e:PointerEvent)=>{if(Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>10)clear();},
  onPointerUp:clear,onPointerCancel:clear,onPointerLeave:clear,
  onClickCapture:(e:React.MouseEvent)=>{if(suppress.current){e.preventDefault();e.stopPropagation();suppress.current=false;}},
 });
}
export function FolderShelf({folders,documents,selected,onSelect,onMenu,gestures,onMove,onError}:{folders:DocumentFolder[];documents:{folder_id?:string|null}[];selected:string;onSelect:(id:string)=>void;onMenu:(item:LibraryItem)=>void;gestures:ReturnType<typeof useLibraryGestures>;onMove:(item:LibraryItem,target:string|null)=>Promise<void>;onError:(error:string)=>void}){
 const [over,setOver]=useState<string|null>(null);const lock=useRef(false);
 const current=folders.find(f=>f.id===selected),path=folderPath(folders,current?.id??null);
 const drop=(id:string|null)=>({onDragOver:(e:DragEvent)=>{if(e.dataTransfer.types.includes(MIME)){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(id??'root');}},onDragLeave:()=>setOver(null),onDrop:async(e:DragEvent)=>{e.preventDefault();e.stopPropagation();setOver(null);if(lock.current)return;try{const item=JSON.parse(e.dataTransfer.getData(MIME)) as LibraryItem;if(!item||!['folder','document'].includes(item.kind)||typeof item.id!=='string')return;lock.current=true;await onMove(item,id);onError('');}catch(error){onError(error instanceof Error?error.message:'이동하지 못했어요.');}finally{lock.current=false;}}});
 const cards=folders.filter(f=>(f.parent_id??null)===(current?.id??null));
 return <section className="library-shelf" aria-label="폴더 탐색"><nav className="folder-breadcrumb" aria-label="폴더 경로"><button {...drop(null)} className={over==='root'?'drop-active':''} onClick={()=>onSelect('__choose__')}>내 보관함</button>{path.map(f=><button key={f.id} {...drop(f.id)} className={over===f.id?'drop-active':''} onClick={()=>onSelect(f.id)}> / {f.name}</button>)}</nav><p className="organize-help">끌어서 폴더에 넣거나, 꾹 눌러 이름 변경·이동을 선택하세요.</p><div className="organizer-grid">{cards.map(f=>{const item:LibraryItem={kind:'folder',id:f.id,name:f.name};return <div key={f.id} className={`organizer-folder ${over===f.id?'drop-active':''}`} {...gestures(item)} {...drop(f.id)}><button className="folder-open" onClick={()=>onSelect(f.id)}><span aria-hidden="true">📁</span><strong>{f.name}</strong><small>{folders.filter(c=>c.parent_id===f.id).length}개 폴더 · {documents.filter(d=>d.folder_id===f.id).length}개 자료</small></button><button data-item-menu className="item-more" aria-label={`${f.name} 폴더 메뉴`} onClick={()=>onMenu(item)}>⋯</button></div>;})}{!cards.length&&<p className="organize-help">{current?'이 안에 하위 폴더가 없어요.':'폴더를 만들어 자료를 정리해 보세요.'}</p>}</div><div className="folder-shortcuts"><button onClick={()=>onSelect('__all__')}>전체 자료</button><button {...drop(null)} className={over==='root'?'drop-active':''} onClick={()=>onSelect('__unfiled__')}>미분류 · 최상위로 이동</button>{current&&<button data-item-menu onClick={()=>onMenu({kind:'folder',id:current.id,name:current.name})}>현재 폴더 메뉴</button>}</div></section>;
}
export function ItemActions({item,folders,onClose,onRename,onMove}:{item:LibraryItem;folders:DocumentFolder[];onClose:()=>void;onRename:(item:LibraryItem,name:string)=>Promise<void>;onMove:(item:LibraryItem,target:string|null)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);const [mode,setMode]=useState('menu'),[name,setName]=useState(item.name),[target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 const run=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{if(mode==='rename')await onRename(item,name);else await onMove(item,target||null);onClose();}catch(e){setError(e instanceof Error?e.message:'저장하지 못했어요.');}finally{lock.current=false;setBusy(false);}};
 return <dialog ref={dialog} className="library-item-dialog" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{if(e.target===dialog.current&&!busy)onClose();}} aria-labelledby="item-action-title"><h2 id="item-action-title">{item.name}</h2>{mode==='menu'?<><button onClick={()=>setMode('rename')}>이름 변경</button><button onClick={()=>setMode('move')}>이동</button><button onClick={onClose}>닫기</button></>:<form onSubmit={e=>{e.preventDefault();void run();}}>{mode==='rename'?<label>새 이름<input autoFocus value={name} maxLength={item.kind==='folder'?80:160} onChange={e=>setName(e.target.value)} disabled={busy}/></label>:<label>이동할 폴더<select autoFocus value={target} onChange={e=>setTarget(e.target.value)} disabled={busy}><option value="">{item.kind==='folder'?'내 보관함 (최상위)':'미분류'}</option>{folders.filter(f=>item.kind!=='folder'||canMoveFolder(folders,item.id,f.id)).map(f=><option key={f.id} value={f.id}>{folderLabel(folders,f.id)}</option>)}</select></label>}{error&&<p role="alert">{error}</p>}<div><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="submit" disabled={busy||(mode==='rename'&&!name.trim())}>{busy?'저장 중…':mode==='rename'?'이름 저장':'이동하기'}</button></div></form>}</dialog>;
}
