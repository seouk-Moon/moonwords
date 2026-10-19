import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PracticeQuestion } from './generation-practice';
import './generation-practice.css';
export function GenerationPractice({questions,ready,status,error,onContinue,onDismissError,onAnswer}:{questions:PracticeQuestion[];ready:boolean;status:string;error:string;onContinue:()=>void;onDismissError:()=>void;onAnswer:(q:PracticeQuestion,correct:boolean)=>void}){
 const [deck,setDeck]=useState(questions);const [index,setIndex]=useState(0);const [picked,setPicked]=useState<number|null>(null);const [skipped,setSkipped]=useState(false);
 const dialog=useRef<HTMLElement>(null);const answered=useRef(false);const advanceLock=useRef(false);const nextButton=useRef<HTMLButtonElement>(null);
 const question=deck[index];
 useEffect(()=>{if(!deck.length&&questions.length)setDeck(questions);},[questions,deck.length]);
 useEffect(()=>{if(skipped&&ready)onContinue();},[skipped,ready,onContinue]);
 useEffect(()=>{answered.current=false;advanceLock.current=false;setPicked(null);dialog.current?.querySelector<HTMLElement>('h1')?.focus();},[index,question?.id]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const siblings=[...document.body.children].filter(e=>e instanceof HTMLElement && !e.classList.contains('generation-practice-host')) as HTMLElement[];
  const states=siblings.map(e=>e.inert);siblings.forEach(e=>{e.inert=true;});dialog.current?.querySelector<HTMLElement>('h1')?.focus();
  const trap=(event:KeyboardEvent)=>{
   if(event.key!=='Tab')return;const nodes=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')??[])].filter(e=>e.getClientRects().length);
   const first=nodes[0],last=nodes.at(-1);if(!nodes.includes(document.activeElement as HTMLElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };window.addEventListener('keydown',trap);
  return()=>{document.body.style.overflow=overflow;siblings.forEach((e,i)=>{e.inert=states[i]});window.removeEventListener('keydown',trap);previous?.focus();};
 },[]);
 const [host]=useState(()=>{const node=document.createElement('div');node.className='generation-practice-host';return node;});
 useLayoutEffect(()=>{document.body.append(host);return()=>{host.remove();};},[host]);
 const answer=(value:number)=>{if(answered.current||picked!==null||!question)return;answered.current=true;setPicked(value);onAnswer(question,value===question.answer);requestAnimationFrame(()=>nextButton.current?.focus());};
 const next=()=>{if(picked===null||advanceLock.current)return;advanceLock.current=true;if(ready){onContinue();return;}setIndex(value=>value+1);};
 return createPortal(<section className="generation-practice" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="generation-practice-title" onKeyDown={event=>{
  if(event.nativeEvent.isComposing||event.repeat)return;
  if(event.key==='Enter'&&picked!==null&&event.target!==nextButton.current){event.preventDefault();next();}
  else if(picked===null&&/^[1-4]$/.test(event.key)&&question){event.preventDefault();answer(Number(event.key)-1);}
 }}><header><span>MOONWORDS · 만드는 동안 복습</span><button type="button" onClick={()=>{setSkipped(true);if(ready)onContinue();}}>건너뛰기 →</button></header>
 <main><div className={`generation-status ${ready?'ready':''}`} role="status">{error?'생성을 마치지 못했어요':ready?(question&&picked===null&&!skipped?'이 문제가 마지막이에요! 새 본문이 다 만들어졌어요.':'다 되었어요! 새 본문으로 넘어가세요.'):status||'새 본문을 만들고 있어요…'}</div>
 {error?<div className="generation-empty"><h1 id="generation-practice-title" tabIndex={-1}>다시 시도할 수 있어요</h1><p role="alert">{error}</p><button className="primary-button" onClick={onDismissError}>본문 추가로 돌아가기</button></div>:!skipped&&question?<article key={question.id}>
 <div className="generation-source"><span>{question.title}</span><small>{question.wrongRate===null?'아직 오답 기록이 없어요':`${question.attempts?'이 문제':'이 본문'} 오답률 ${Math.round(question.wrongRate*100)}%`}</small></div>
 <h1 id="generation-practice-title" tabIndex={-1}>{question.prompt}</h1><p className="generation-help">최근 학습한 본문 8개에서 오답률이 높은 순서로 복습해요.</p>
 <div className="generation-options">{question.options.map((option,i)=><button key={`${question.id}-${i}`} type="button" disabled={picked!==null} className={picked!==null?(i===question.answer?'correct':picked===i?'incorrect':'muted'):''} onClick={()=>answer(i)}><span>{i+1}</span>{option}</button>)}</div>
 {picked!==null&&<div className="generation-answer"><b>{picked===question.answer?'맞았어요!':'정답을 확인하세요'}</b><strong>{question.options[question.answer]}</strong><p>{question.explanation}</p><button ref={nextButton} type="button" className="primary-button" onClick={next}>{ready?'다 되었어요 · 새 본문으로 →':'다음 문제 →'}</button></div>}
 </article>:<div className="generation-empty"><h1 id="generation-practice-title" tabIndex={-1}>{ready?'다 되었어요!':skipped?'복습을 건너뛰었어요':deck.length?'준비한 복습을 모두 마쳤어요':'본문을 준비하고 있어요'}</h1><p>{ready?'새 본문에서 바로 학습을 시작하세요.':skipped?'생성이 완료되면 새 본문으로 바로 이동해요.':deck.length?'조금만 기다리면 새 본문으로 넘어갈 수 있어요.':'풀 수 있는 최근 4지선다 문제가 있으면 여기에 나타나요.'}</p>{ready&&<button className="primary-button" onClick={onContinue}>새 본문으로 →</button>}</div>}
 </main><footer>1–4 보기 선택 · Enter 다음 문제</footer></section>,host);
}
