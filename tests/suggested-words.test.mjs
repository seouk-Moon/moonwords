import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/features/study/suggested-words.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {shouldRecommendWord,collectSuggestedWords}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
test('common words, everyday long words and familiar expressions are excluded',()=>{
 for(const word of ['apple','beautiful','important','information','environment','education','development','understand','understood','happiness','students','playing','walked','give up','look after','take care of','in front of'])assert.equal(shouldRecommendWord(word),false,word);
});
test('uncommon vocabulary, including short words, and advanced expressions survive',()=>{
 for(const word of ['defunct','debris','trajectory','ubiquitous','mitigate','serendipity','wane','abate','infer','acceleration','in lieu of','shed light on'])assert.equal(shouldRecommendWord(word),true,word);
});
const sentence=(id,english,terms)=>({id,english,korean:'번역',keywords:terms.map(word=>({word,meaning:'문맥 뜻'}))});
test('existing documents use the cutoff immediately without altering keywords',()=>{
 const input=[sentence(1,'A beautiful satellite follows a trajectory through debris.',['beautiful','satellite','trajectory','debris'])];
 const before=structuredClone(input);assert.deepEqual(collectSuggestedWords(input,[]).map(w=>w.word),['trajectory','debris']);assert.deepEqual(input,before);
});
test('saved words, duplicates, absent words, empty meanings and out-of-scope chapters are excluded',()=>{
 const input=[sentence(1,'Defunct spacecraft had an unusual trajectory.',['defunct','trajectory','mitigate']),sentence(2,'Debris follows a trajectory.',['debris','trajectory'])];
 input[1].keywords.push({word:'Debris',meaning:''});
 assert.deepEqual(collectSuggestedWords(input,[{word:' DEFUNCT '}],new Set([1])).map(w=>w.word),['trajectory']);
 assert.deepEqual(collectSuggestedWords(input,[]).map(w=>w.word),['defunct','trajectory','debris']);
});
test('no fallback re-adds easy words; non-English tokens, numbers and acronyms are excluded',()=>{
 assert.deepEqual(collectSuggestedWords([sentence(1,'Beautiful information.',['beautiful','information'])],[]),[]);
 for(const word of ['NASA','2026','한국어',''])assert.equal(shouldRecommendWord(word),false,word);
});
