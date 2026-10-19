import { useState } from 'react';
import type { ClassExercise, DocumentAnalysis } from '../../types';
import { isDefinitionAnswer } from './class-exercises';
import './class-exercises.css';

function Exercise({q,index}:{q:ClassExercise;index:number}) {
  const [answer,setAnswer]=useState('');
  const [revealed,setRevealed]=useState(false);
  const [assessment,setAssessment]=useState('');
  const blank=q.kind==='definition_blank';
  return <article className="class-exercise">
    <h3>{index+1}. {blank?'영영풀이 빈칸':'조건 영작'} <small>{q.basis==='notes'?'필기 기반':'본문 기반'}</small></h3>
    {blank ? <><p className="class-passage">{q.passage.split('[BLANK]')[0]}<span className="class-blank">{q.firstLetter}______</span>{q.passage.split('[BLANK]')[1]}</p><p lang="en"><b>English definition</b><br/>{q.definition}</p></> : <><p>{q.translation}</p><p><b>제시어:</b> {q.givenWords.join(' · ')}</p>{q.conditions.length>0?<ul>{q.conditions.map((condition,i)=><li key={i}>{condition}</li>)}</ul>:<p>제시어를 사용해 위 해석에 맞는 문장을 쓰세요.</p>}</>}
    <form onSubmit={e=>{e.preventDefault();setRevealed(true);}}>
      <label className="field">{blank?'첫 글자를 포함한 단어':'영어 문장'}<textarea aria-label={`${index+1}번 답`} autoCapitalize="none" spellCheck={false} rows={blank?1:3} value={answer} disabled={revealed} onChange={e=>setAnswer(e.target.value)} /></label>
      {!revealed && <button className="primary-button" disabled={!answer.trim()}>답안 확인</button>}
    </form>
    {revealed && <div className="class-answer" role="status">
      <b>{blank?(isDefinitionAnswer(answer,q.answer)?'정답이에요':'정답 확인'):'예시 답안'}</b>
      <p lang="en">{q.answer}</p><div>{q.explanation}</div>
      {!blank && <><small>표현이 달라도 맞을 수 있어요. 제시어와 각 조건을 비교해 직접 확인해 주세요.</small><div className="class-assessment"><button aria-pressed={assessment==='correct'} onClick={()=>setAssessment('correct')}>조건을 만족했어요</button><button aria-pressed={assessment==='review'} onClick={()=>setAssessment('review')}>다시 볼래요</button></div></>}
      <details><summary>출제 근거 보기</summary><p>{q.evidence}</p>{!blank&&<p lang="en">{q.passage}</p>}</details>
      <button onClick={()=>{setAnswer('');setRevealed(false);setAssessment('');}}>다시 풀기</button>
    </div>}
  </article>;
}
export function ClassExercises({analysis}:{analysis:DocumentAnalysis}) {
  const questions=analysis.class_exercises;
  if(!questions)return null;
  return <details className="class-exercises"><summary>수업 맞춤 문제 · {questions.length}문제</summary>
    <p>영영풀이 빈칸과 조건 영작을 풀어 보세요. 영작은 예시 답안으로 직접 확인해요.</p>
    {analysis.class_materials?.notesName&&<p>필기본: {analysis.class_materials.notesName}</p>}
    {!questions.length&&<p>확실한 출제 근거를 찾지 못했어요. 읽을 수 있는 원문이나 선명한 필기를 함께 올려 주세요.</p>}
    {questions.map((q,i)=><Exercise key={`${i}:${q.passage}`} q={q} index={i}/>)}
  </details>;
}
