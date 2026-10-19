import type { LearningEvent, QuizAttempt, StudyDocument, VocabularyItem } from '../../types';
export type PracticeQuestion = {id:string;documentId:string;title:string;mode:'meaning'|'comprehension';wordId?:string;questionKey:string;prompt:string;options:string[];answer:number;explanation:string;wrongRate:number|null;attempts:number};
const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function buildGenerationPractice(documents: StudyDocument[], words: VocabularyItem[], events: LearningEvent[], attempts: QuizAttempt[]): PracticeQuestion[] {
 const recent=documents.filter(d=>d.last_studied_at&&!d.analysis.collection&&d.source_type!=="vocabulary_collection").sort((a,b)=>Date.parse(b.last_studied_at!)-Date.parse(a.last_studied_at!)).slice(0,8);
 const ids=new Set(recent.map(d=>d.id));const result:PracticeQuestion[]=[];
 const exactStats=new Map<string,{wrong:number;total:number}>();const docStats=new Map<string,{wrong:number;total:number}>();
 for(const e of events){if(!e.document_id||!ids.has(e.document_id)||e.event_type!=='quiz_answer'||typeof e.is_correct!=='boolean')continue;const key=e.word_id?`word:${e.word_id}`:typeof e.metadata?.questionKey==='string'?e.metadata.questionKey:null;if(!key)continue;const id=`${e.document_id}:${key}`;const value=exactStats.get(id)??{wrong:0,total:0};value.total++;if(!e.is_correct)value.wrong++;exactStats.set(id,value);}
 for(const a of attempts){if(!ids.has(a.document_id)||!Number.isFinite(a.question_count)||a.question_count<=0||!Number.isFinite(a.score))continue;const value=docStats.get(a.document_id)??{wrong:0,total:0};value.total+=a.question_count;value.wrong+=Math.max(0,Math.min(a.question_count,a.question_count-a.score));docStats.set(a.document_id,value);}
 const meanings=[...new Map(words.filter(w=>ids.has(w.document_id)&&w.meaning.trim()).map(w=>[normalize(w.meaning),w.meaning])).values()].slice(0,4);
 const rank=(docId:string,key:string,wordId?:string)=>{
  const exact=exactStats.get(`${docId}:${wordId?`word:${wordId}`:key}`);if(exact)return {wrongRate:exact.wrong/exact.total,attempts:exact.total};
  const doc=docStats.get(docId);return {wrongRate:doc?doc.wrong/doc.total:null,attempts:0};
 };
 for(const doc of recent){
  for(const q of doc.analysis.questions){
   if(q.options.length!==4||new Set(q.options.map(normalize)).size!==4||q.answer<0||q.answer>3||!Number.isInteger(q.answer))continue;
   const key=`comprehension:${q.question}`;
   result.push({id:`${doc.id}:${key}`,documentId:doc.id,title:doc.title,mode:'comprehension',questionKey:key,prompt:q.question,options:q.options,answer:q.answer,explanation:q.explanation,...rank(doc.id,key)});
  }
  for(const word of words.filter(w=>w.document_id===doc.id)){
   const alternatives=meanings.filter(meaning=>normalize(meaning)!==normalize(word.meaning)).slice(0,3);
   if(alternatives.length!==3||!word.meaning.trim())continue;
   const answer=[...word.id].reduce((n,c)=>n+c.charCodeAt(0),0)%4;const options=[...alternatives];options.splice(answer,0,word.meaning);
   const key=`word:${word.id}`;
   result.push({id:`${doc.id}:${key}`,documentId:doc.id,title:doc.title,mode:'meaning',wordId:word.id,questionKey:key,prompt:word.source_sentence?.trim()?`${word.word}\n${word.source_sentence}\n이 문맥에서 단어의 뜻은?`:`${word.word}\n이 단어의 뜻은?`,options,answer,explanation:word.meaning,...rank(doc.id,key,word.id)});
  }
 }
 const seen=new Set<string>();
 return result.sort((a,b)=>(b.wrongRate??-1)-(a.wrongRate??-1)||b.attempts-a.attempts||recent.findIndex(d=>d.id===a.documentId)-recent.findIndex(d=>d.id===b.documentId)).filter(q=>{const key=normalize(q.prompt)+':'+normalize(q.options[q.answer]);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,40);
}
