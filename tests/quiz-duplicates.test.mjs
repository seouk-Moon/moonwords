import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: [new URL('../src/features/quiz/quiz-utils.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { distinctAlternatives, normalizeQuestionText, mergeUniqueQuestions, uniqueQuizQuestions, createAdditionalClozeQuestions } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
const question = (prompt, options = ['a', 'b'], answer = 0) => ({ question: prompt, options, answer, explanation: '' });
test('punctuation, whitespace, case and blank width do not create duplicate questions', () => {
 assert.equal(normalizeQuestionText('“What IS this?”'), normalizeQuestionText('what is this!'));
 assert.equal(normalizeQuestionText('A ______ B.'), normalizeQuestionText('a ___ b!'));
 const old = [question('What is this?')];
 const merged = mergeUniqueQuestions(old, [question(' WHAT IS THIS! '), question('New question'), question('New question!')]);
 assert.equal(merged.length, 2);
 assert.equal(merged[0], old[0]);
});
test('invalid generated answer does not block a later valid copy', () => {
 assert.equal(mergeUniqueQuestions([], [question('new', ['a'], 0), question('new')]).length, 1);
 assert.equal(mergeUniqueQuestions([], [question('new', ['a', 'b'], .5)]).length, 0);
});
test('quiz pool collapses saved/AI duplicates while preserving source and legacy question ids', () => {
 const saved = { kind: 'choice', prompt: '______ is a satellite.', options: ['A', 'B'], answer: 0, explanation: '', wordId: 'saved' };
 const generated = { ...saved, wordId: undefined, prompt: '___ IS a satellite!' };
 const result = uniqueQuizQuestions([saved, generated]);
 assert.deepEqual(result, [saved]);
 const reading = { ...saved, wordId: undefined, sourceQuestionId: 5 };
 assert.equal(uniqueQuizQuestions([reading, { ...reading, sourceQuestionId: 6 }])[0].sourceQuestionId, 5);
});
test('cloze generation skips blanks already covered by saved words', () => {
 const doc = { analysis: { sentences: [{ id: 1, english: 'Alpha is useful.', korean: '번역', keywords: [{ word: 'Alpha', meaning: '뜻' }] }], cloze_questions: [] } };
 const words = [{ word: 'Alpha', source_sentence: 'Alpha is useful.', sentence_id: 1 }, { word: 'Beta', source_sentence: 'Beta is useful.', sentence_id: 2 }, { word: 'Gamma', source_sentence: 'Gamma is useful.', sentence_id: 3 }, { word: 'Delta', source_sentence: 'Delta is useful.', sentence_id: 4 }];
 assert.deepEqual(createAdditionalClozeQuestions(doc, words, 3), []);
});

test('alternatives never repeat the correct answer or equivalent distractors', () => {
 assert.deepEqual(distinctAlternatives(['Alpha', 'ALPHA', ' beta ', 'Beta!', 'gamma'], 'alpha'), [' beta ', 'gamma']);
});

test('word quiz preserves every selected entry, including repeated words and meanings', () => {
 for (const kind of ['choice','written','flashcard']) {
  const entries = ['one','two','three'].map(wordId => ({kind,wordId,prompt:'same prompt',front:'same front',back:'same back'}));
  assert.equal(uniqueQuizQuestions(entries, {preserveWordEntries:true}).length,3);
  assert.equal(uniqueQuizQuestions([...entries,entries[0]], {preserveWordEntries:true}).length,3);
 }
});
