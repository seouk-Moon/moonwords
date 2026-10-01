import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabularySets, readStudySettings, writeStudySettings, toggleStudyMark, recordStudyOutcome, quizStudyKey } from '../src/features/vocabulary/study-sets.ts';
const progress = { user_id: 'u', document_id: 'doc', sentence_notes: { '5': '기존 메모' }, understood_sentence_ids: [5], bookmarked_sentence_ids: [5], last_studied_at: '' };
test('fixed sets retain membership when counters change and new words are appended', () => {
 const words = Array.from({ length: 23 }, (_, i) => ({ id: String(i), created_at: String(i).padStart(3, '0') }));
 const sets = buildVocabularySets([...words].reverse(), 10);
 assert.deepEqual(sets.map(set => set.length), [10, 10, 3]);
 assert.deepEqual(sets[0], words.slice(0, 10));
 const changed = words.map(word => ({ ...word, correct_count: 3 }));
 assert.deepEqual(buildVocabularySets(changed, 10).map(set => set.map(w => w.id)), sets.map(set => set.map(w => w.id)));
 assert.deepEqual(buildVocabularySets([...words, { id: 'new', created_at: '999' }], 10)[0], sets[0]);
 assert.deepEqual(buildVocabularySets(words, 7).map(set => set.length), [7, 7, 7, 2]);
 assert.deepEqual(buildVocabularySets([{ id: 'z', created_at: 'same' }, { id: 'a', created_at: 'same' }], 1).map(set => set[0].id), ['z', 'a']);
});
test('set size, stars and importance round-trip without losing existing notes', () => {
 let next = writeStudySettings(progress, { ...readStudySettings(progress), setSize: 7 });
 next = toggleStudyMark(next, 'word:one', 'starred');
 next = toggleStudyMark(next, 'word:one', 'important');
 assert.deepEqual(readStudySettings(next), { setSize: 7, starred: ['word:one'], important: ['word:one'], incorrect: [] });
 next = toggleStudyMark(next, 'word:one', 'starred');
 assert.deepEqual(readStudySettings(next).starred, []);
 assert.deepEqual(readStudySettings(next).important, ['word:one']);
 assert.equal(next.sentence_notes['5'], '기존 메모');
 assert.deepEqual(next.bookmarked_sentence_ids, [5]);
});
test('wrong answers are unique and successful retries remove them, preserving marks', () => {
 let next = toggleStudyMark(progress, 'word:one', 'starred');
 next = recordStudyOutcome(recordStudyOutcome(next, 'word:one', false), 'word:one', false);
 assert.deepEqual(readStudySettings(next).incorrect, ['word:one']);
 next = recordStudyOutcome(next, 'word:one', true);
 assert.deepEqual(readStudySettings(next).incorrect, []);
 assert.deepEqual(readStudySettings(next).starred, ['word:one']);
});
test('word keys span quiz formats and generated question keys survive option shuffling', () => {
 const choice = { kind: 'choice', wordId: 'one', prompt: 'one', options: ['a', 'b'], answer: 0, explanation: '' };
 assert.equal(quizStudyKey('meaning', choice), quizStudyKey('cloze', choice));
 const generated = { ...choice, wordId: undefined };
 assert.equal(quizStudyKey('cloze', generated), quizStudyKey('cloze', { ...generated, options: ['b', 'a'], answer: 1 }));
 assert.notEqual(quizStudyKey('cloze', generated), quizStudyKey('comprehension', generated));
});
test('invalid saved settings recover safely', () => {
 for(const value of ['broken', 'null', '{"setSize":0,"starred":[1,"a","a"]}']) {
  const settings = readStudySettings({ ...progress, sentence_notes: { __moonwords_study_sets_v1: value } });
  assert.equal(settings.setSize, 10);
 }
});
