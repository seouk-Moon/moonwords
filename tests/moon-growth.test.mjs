import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningAnalytics } from '../src/features/progress/learning-analytics.ts';
import { dailyMissionProgress, moonGrowth, moonLightPath } from '../src/features/progress/moon-growth.ts';
import { readLearningHistory } from '../src/features/progress/learning-history.ts';

const goals = {fullListeningDocuments:0, flashcardDocuments:0, quizDocuments:1};
const attempt = (date, id = date) => ({id,user_id:'u',document_id:'doc',mode:'meaning',score:1,question_count:1,created_at:date+'T12:00:00'});
const snapshot = (dates, now='2026-10-19') => buildLearningAnalytics({events:[], sessions:[], quizAttempts:dates.map(d=>attempt(d)),storageReady:true,now:new Date(now+'T18:00:00'),dailyGoals:goals});

test('mission days count once per date; a missed day breaks streak but preserves grown moon', () => {
  const first = snapshot(['2026-10-16','2026-10-17','2026-10-17']);
  assert.equal(first.totalMissionDays,2);assert.equal(first.currentStreak,0);assert.equal(first.longestStreak,2);
  const resumed = snapshot(['2026-10-16','2026-10-17','2026-10-19']);
  assert.equal(resumed.totalMissionDays,3);assert.equal(resumed.currentStreak,1);
  assert.ok(moonGrowth(resumed.totalMissionDays,100,true).light > moonGrowth(first.totalMissionDays,0,false).light);
  const yesterday = snapshot(['2026-10-17','2026-10-18']);assert.equal(yesterday.currentStreak,2);
});
test('moon brightens every completed day, includes partial daily progress, never double-counts completion', () => {
  let prior=0;
  for(let day=0;day<=21;day++){const state=moonGrowth(day,0,true);assert.ok(state.light>prior);prior=state.light;}
  assert.ok(moonGrowth(5,33,false).light>moonGrowth(5,0,false).light);
  assert.ok(moonGrowth(5,99,false).light<moonGrowth(6,100,true).light);
  assert.equal(moonGrowth(6,100,true).light,moonGrowth(6,0,true).light);
  assert.equal(moonGrowth(42,100,true).light,1);
  assert.ok(!moonLightPath(.5).includes('NaN'));
});
test('daily mission progress handles partial, disabled and completed goals honestly', () => {
  const a=snapshot([]).today;
  assert.equal(dailyMissionProgress(a,goals),0);
  assert.equal(dailyMissionProgress({...a,quizDocuments:1}, {...goals,quizDocuments:2}),50);
  assert.equal(dailyMissionProgress(a,{fullListeningDocuments:0,flashcardDocuments:0,quizDocuments:0}),0);
  assert.equal(dailyMissionProgress({...a,qualified:true}, {fullListeningDocuments:0,flashcardDocuments:0,quizDocuments:0}),100);
  assert.equal(dailyMissionProgress({...a,quizDocuments:4},goals),100);
});
test('history pages past 1000 rows and reports failures instead of claiming partial history is complete', async () => {
  const rows=Array.from({length:1201},(_,i)=>({id:i}));
  const calls=[];const result=await readLearningHistory(async(from,to)=>{calls.push([from,to]);return {data:rows.slice(from,to+1),error:null};});
  assert.equal(result.data.length,1201);assert.equal(calls.length,3);
  const broken=await readLearningHistory(async(from)=>from===0?{data:rows.slice(0,500),error:null}:{data:null,error:{message:'offline'}});
  assert.equal(broken.data,null);assert.equal(broken.error.message,'offline');
});
