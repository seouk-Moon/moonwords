export type MaterialFile = {file:File|null;role:''|'original'|'notes'};
export function MaterialFileInputs({values,onChange,disabled}:{values:MaterialFile[];onChange:(v:MaterialFile[])=>void;disabled:boolean}){
  const update=(index:number,patch:Partial<MaterialFile>)=>onChange(values.map((value,i)=>i===index?{...value,...patch}:value));
  return <div className="material-file-inputs">
    <p>첫 파일은 필수예요. 파일을 올린 뒤 원문인지 필기본인지 골라 주세요. 다른 자료가 있으면 두 번째 파일도 올릴 수 있어요.</p>
    {values.map((item,index)=><fieldset key={index} disabled={disabled||(index===1&&(!values[0].file||!values[0].role))}>
      <legend>{index+1}번째 파일 · {index===0?'필수':'선택'}</legend>
      <label className="field">{index+1}번째 파일 선택<input aria-label={`${index+1}번째 파일 선택`} type="file" accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp" onChange={e=>{const selected=e.target.files?.[0]??null;update(index,{file:selected,role:''});e.target.value='';}} /></label>
      {item.file&&<><strong className="material-filename">{item.file.name}</strong><label className="field">{index+1}번째 파일 종류<select aria-label={`${index+1}번째 파일 종류`} value={item.role} onChange={e=>update(index,{role:e.target.value as MaterialFile['role']})}><option value="">원문 / 필기본 선택</option><option value="original" disabled={values.some((v,i)=>i!==index&&v.file&&v.role==='original')}>원문</option><option value="notes" disabled={values.some((v,i)=>i!==index&&v.file&&v.role==='notes')}>필기본</option></select></label><button type="button" onClick={()=>onChange(index===0?[{file:null,role:''},{file:null,role:''}]:values.map((v,i)=>i===index?{file:null,role:''}:v))}>{index+1}번째 파일 삭제</button></>}
    </fieldset>)}
    <small>PDF · DOCX · TXT · MD · JPG · PNG · WEBP / 원문과 필기본을 각각 하나씩 선택할 수 있어요.</small>
  </div>;
}
