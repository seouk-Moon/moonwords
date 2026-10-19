import test from 'node:test';import assert from 'node:assert/strict';
import {buildGenerationPractice} from '../src/features/upload/generation-practice.ts';
import {classifyExam,preserveExamSource} from '../src/features/upload/exam-source.ts';
const analysis={level:'B1',topic:'t',summary:'s',structure:'s',sections:[{id:1,label:'첫',role:''},{id:2,label:'둘',role:''}],sentences:[{id:1,paragraph:1,english:'Original A.',korean:'A',keywords:[]},{id:2,paragraph:2,english:'Original B.',korean:'B',keywords:[]}],questions:[]};
const q=(question,answer=0)=>({question,options:['a','b','c','d'],answer,explanation:'because'});
const doc=(id,date,questions=[q(id)])=>({id,title:id,last_studied_at:date,analysis:{...analysis,questions}});
test('exam types detect ordering/insertion/summary/grammar and plain passages remain reading',()=>{
 assert.equal(classifyExam('주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?'),'글의 순서');assert.equal(classifyExam('주어진 문장이 들어가기에 가장 적절한 곳은?'),'문장 삽입');assert.equal(classifyExam('요약문의 빈칸에 들어갈 말'),'요약문 완성');assert.equal(classifyExam('다음 글의 밑줄 친 부분 중 어법상 틀린 것은?'),'어법');assert.equal(classifyExam('People learn every day.'),null);
});
test('Korean question, five choices, OCR and vision transcription persist without altering sentence IDs or wording',()=>{
 const raw='29. 다음 글의 주제로 가장 적절한 것은?\nEnglish source.\n① 선택 하나 ② 선택 둘 ③ 선택 셋 ④ 선택 넷 ⑤ 선택 다섯';
 const source={...analysis,source_exam:{kind:'exam',questionType:'주제',rawText:raw,questions:[{label:'29',questionType:'주제',prompt:'다음 글의 주제로 가장 적절한 것은?',options:['① 선택 하나','② 선택 둘','③ 선택 셋','④ 선택 넷','⑤ 선택 다섯']}]}};
 const before=JSON.stringify(source);const result=preserveExamSource(source,'OCR: '+raw,true,true);
 assert.equal(JSON.stringify(source),before);assert.equal(result.source_exam.questions[0].options.length,5);assert.equal(result.source_exam.rawText,raw);assert.equal(result.source_exam.ocrText,'OCR: '+raw);assert.equal(result.sections.length,1);assert.equal(result.sentences[1].id,2);assert.equal(result.sentences[1].english,'Original B.');assert.equal(result.sentences[1].paragraph,1);
 assert.equal(preserveExamSource(source,'Unmodified text input must remain intact.',false).source_exam.rawText,'Unmodified text input must remain intact.');
 const old=preserveExamSource(analysis,raw,true);assert.equal(old.source_exam.rawText,raw);assert.equal(old.source_exam.questionType,'주제');
});
test('practice ranks exact question errors, uses document rate explicitly when no item record exists, excludes unstudied and malformed choices',()=>{
 const docs=[doc('recent','2026-10-19',[q('hard'),q('easy'),{...q('invalid'),options:['x','y']}]),doc('older','2026-10-18'),{...doc('never',null)}];
 const event=(key,correct)=>({document_id:'recent',event_type:'quiz_answer',is_correct:correct,metadata:{questionKey:`comprehension:${key}`}});
 const result=buildGenerationPractice(docs,[],[event('hard',false),event('hard',false),event('easy',true)],[{document_id:'older',score:1,question_count:2}]);
 assert.deepEqual(result.map(q=>q.prompt),['hard','older','easy']);assert.equal(result[0].wrongRate,1);assert.equal(result[0].attempts,2);assert.equal(result[1].wrongRate,.5);assert.equal(result[1].attempts,0);assert.equal(result.every(q=>q.options.length===4),true);
});
test('word practice requires three distinct distractors, stores correct answer, removes duplicated prompts',()=>{
 const words=['one','two','three','four'].map((meaning,i)=>({id:'w'+i,document_id:'d',word:'word'+i,meaning}));const result=buildGenerationPractice([doc('d','2026-10-19',[])],words,[],[]);
 assert.equal(result.length,4);for(const item of result){assert.equal(new Set(item.options).size,4);assert.equal(item.options[item.answer],words.find(w=>w.id===item.wordId).meaning)}
 assert.equal(buildGenerationPractice([doc('d','2026-10-19',[])],words.slice(0,3),[],[]).length,0);
});
