import type { DocumentFolder } from '../../types';
export type LibraryItem = {kind:'folder'|'document';id:string;name:string};
export function folderPath(folders:DocumentFolder[],id:string|null):DocumentFolder[]{
 const path:DocumentFolder[]=[],seen=new Set<string>();let next=id;
 while(next&&!seen.has(next)){seen.add(next);const f=folders.find(v=>v.id===next);if(!f)break;path.unshift(f);next=f.parent_id??null;}return path;
}
export function canMoveFolder(folders:DocumentFolder[],id:string,parent:string|null){return parent===null||(!folderPath(folders,parent).some(f=>f.id===id)&&folders.some(f=>f.id===parent));}
export const folderLabel=(folders:DocumentFolder[],id:string)=>folderPath(folders,id).map(f=>f.name).join(' / ');
