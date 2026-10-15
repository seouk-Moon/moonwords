import test from 'node:test';
import assert from 'node:assert/strict';
import {findSimilarWords,similarWordPairs,normalizeVocabularyWord} from '../src/features/vocabulary/similar-words.ts';
const words=(...values)=>values.map((word,i)=>({id:String(i),word,meaning:'뜻'+i}));
test('same word ignores common POS annotations, case and extra whitespace',()=>{
 for(const value of ['BANK (n.)','bank [v.]','(명사) bank','bank (명사/동사)','bank n.','bank (noun/verb)','v. bank',' bank  '])assert.equal(normalizeVocabularyWord(value),'bank');
 assert.equal(normalizeVocabularyWord('Take   off (phr.)'),'take off');
 assert.equal(findSimilarWords(words('bank (n.)','BANK [v.]')).length,1);
});
test('different spelling is not a duplicate and short exact words are included',()=>{
 assert.equal(findSimilarWords(words('education','educate','moon','moons')).length,0);
 assert.equal(findSimilarWords(words('go (v.)','GO')).length,1);
 assert.equal(findSimilarWords(words('ice cream','icecream')).length,0);
 assert.equal(normalizeVocabularyWord('have a'),'have a');
 assert.equal(normalizeVocabularyWord('word (formal)'),'word (formal)');
 assert.equal(normalizeVocabularyWord('plan.'),'plan.');
});
test('same word with different meanings is retained in a comparison pair',()=>{
 const entries=words('bank (n.)','bank (n.)');entries[0].meaning='은행';entries[1].meaning='강둑';
 const pair=[...similarWordPairs(findSimilarWords(entries))][0];assert.equal(pair.words[0].meaning,'은행');assert.equal(pair.words[1].meaning,'강둑');
});
test('empty keys are ignored; changes and deletions recalculate groups',()=>{
 assert.equal(findSimilarWords(words('(n.)','[v.]')).length,0);
 assert.equal(findSimilarWords(words('bank','bank')).length,1);
 assert.equal(findSimilarWords(words('bank','blank')).length,0);
 assert.equal(findSimilarWords(words('bank')).length,0);
});
test('three duplicates yield three unique pairs with exactly two entries each',()=>{
 const pairs=[...similarWordPairs(findSimilarWords(words('bank','BANK (v.)','bank [n.]')))];
 assert.equal(pairs.length,3);assert.equal(new Set(pairs.map(p=>p.key)).size,3);assert.ok(pairs.every(p=>p.words.length===2));
});
test('large matching groups yield first pairs without allocating all pairs',()=>{
 const group={sharedText:'bank',words:Array.from({length:5000},(_,i)=>({id:String(i),word:'bank'}))};
 const pairs=similarWordPairs([group]);assert.equal(pairs.next().value.words.length,2);assert.equal(pairs.next().value.words[1].id,'2');
});
