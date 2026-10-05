import test from 'node:test';import assert from 'node:assert/strict';
import {readStudySettings,setVocabularySetSize,toggleStudyMark} from '../src/features/vocabulary/study-sets.ts';
const base={user_id:'u',document_id:'doc',sentence_notes:{'8':'원래 메모'},understood_sentence_ids:[],bookmarked_sentence_ids:[],last_studied_at:''};
test('local recovery survives pending cloud save; settings stay scoped to user and document',()=>{
 const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}};
 try {
  const first=setVocabularySetSize(base,7);assert.equal(readStudySettings(first).setSize,7);
  assert.equal(readStudySettings(base).setSize,7); // Server has not received the update yet.
  assert.equal(readStudySettings({...base,document_id:'other'}).setSize,10);
  assert.equal(readStudySettings({...base,user_id:'other'}).setSize,10);
  const second=setVocabularySetSize(first,12);
  assert.equal(readStudySettings(first).setSize,12);
  assert.ok(Date.parse(readStudySettings(second).setSizeUpdatedAt)>Date.parse(JSON.parse(first.sentence_notes.__moonwords_study_sets_v1).setSizeUpdatedAt));
  const marked=toggleStudyMark(second,'word:one','starred');assert.equal(readStudySettings(marked).setSize,12);assert.equal(marked.sentence_notes['8'],'원래 메모');
  const future={...base,sentence_notes:{__moonwords_study_sets_v1:JSON.stringify({setSize:20,setSizeUpdatedAt:'2099-01-01T00:00:00.000Z'})}};
  assert.equal(readStudySettings(future).setSize,20); // Newer changes from another device win.
 } finally {delete globalThis.window;}
});
test('blocked browser storage still returns a valid cloud payload',()=>{
 globalThis.window={localStorage:{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}}};
 try{assert.equal(readStudySettings(setVocabularySetSize(base,15)).setSize,15);}finally{delete globalThis.window;}
});
