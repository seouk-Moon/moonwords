import type { ClassExercise } from '../../types';
const normalized = (s:string) => s.toLowerCase().replace(/\s+/g,' ').trim();
export function validateClassExercises(value:unknown, source:string):ClassExercise[] {
  if(!Array.isArray(value))return [];
  const seen=new Set<string>();
  return value.filter((q):q is ClassExercise=>{
    if(!q || !['definition_blank','guided_writing'].includes(q.kind) || !['notes','passage'].includes(q.basis))return false;
    if(!['passage','answer','firstLetter','definition','translation','explanation','evidence'].every(k=>typeof q[k]==='string'))return false;
    if(!q.answer.trim() || !q.evidence.trim() || !q.explanation.trim())return false;
    if(![q.givenWords,q.conditions].every(a=>Array.isArray(a)&&a.every(v=>typeof v==='string')))return false;
    if(q.kind==='definition_blank'){
      if(!/^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(q.answer)||q.firstLetter.toLowerCase()!==q.answer[0].toLowerCase()||!q.definition.trim())return false;
      if(q.passage.split('[BLANK]').length!==2)return false;
      if(!normalized(source).includes(normalized(q.passage.replace('[BLANK]',q.answer))))return false;
      const answerPattern=new RegExp(`\\b${q.answer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i');
      if(answerPattern.test(q.definition))return false;
    } else {
      if(!q.translation.trim()||q.givenWords.length!==2||q.givenWords.some((w:string)=>!w.trim()))return false;
      if(!normalized(source).includes(normalized(q.passage))||!q.passage.trim())return false;
    }
    const key=q.kind+':'+normalized(q.kind==='definition_blank'?q.answer:q.passage);
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,10);
}
export const isDefinitionAnswer = (answer:string, expected:string) => normalized(answer)===normalized(expected);
