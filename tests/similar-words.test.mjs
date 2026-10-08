import test from 'node:test';
import assert from 'node:assert/strict';
import {findSimilarWords} from '../src/features/vocabulary/similar-words.ts';
const words = (...values) => values.map((word,i) => ({id:String(i),word,meaning:'뜻'+i}));
test('four contiguous characters match independent of case and position',()=>{
 const groups=findSimilarWords(words('education','EDUCATE','cat','catch'));
 assert.equal(groups.length,1);assert.equal(groups[0].sharedText,'educ');assert.deepEqual(groups[0].words.map(w=>w.id),['0','1']);
});
test('exact duplicates with distinct meanings survive; short words and separators do not match',()=>{
 assert.equal(findSimilarWords(words('MOON','moon')).length,1);
 assert.equal(findSimilarWords(words('cat','cat','ab cd','abcd')).length,0);
 assert.equal(findSimilarWords(words('학교생활','학교생활기록')).length,1);
});
test('multiple repeated fragments do not duplicate a group or a word',()=>{
 const groups=findSimilarWords(words('banana','bananas'));
 assert.equal(groups.length,1);assert.equal(groups[0].words.length,2);
 assert.equal(findSimilarWords(words('aaaaaa')).length,0);
});
test('matches update after editing or deleting entries',()=>{
 assert.equal(findSimilarWords(words('education','educate')).length,1);
 assert.equal(findSimilarWords(words('education','cat')).length,0);
 assert.equal(findSimilarWords(words('education')).length,0);
});
