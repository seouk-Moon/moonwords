import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClassExercises,isDefinitionAnswer} from '../src/features/study/class-exercises.ts';
const sentence='The teacher made the lesson memorable.';
const blank={kind:'definition_blank',passage:'The teacher made the lesson [BLANK].',answer:'memorable',firstLetter:'m',definition:'worth remembering',translation:'',givenWords:[],conditions:[],explanation:'기억할 만한',evidence:'memorable에 밑줄',basis:'notes'};
const writing={...blank,kind:'guided_writing',passage:sentence,answer:sentence,translation:'선생님은 수업을 기억에 남게 만들었다.',givenWords:['make','memorable'],conditions:['5형식'],firstLetter:'',definition:''};
test('preserves both exercise types and deduplicates repeated answers',()=>{
 assert.equal(validateClassExercises([blank,writing,blank],sentence).length,2);
 assert.equal(isDefinitionAnswer(' Memorable ','memorable'),true);
 assert.equal(isDefinitionAnswer('memory','memorable'),false);
});
test('rejects leaked answers, wrong initials, invented sentences, missing evidence and invalid word counts',()=>{
 for(const invalid of [{...blank,definition:'Something memorable'},{...blank,firstLetter:'a'},{...blank,passage:'Invented [BLANK].'},{...blank,evidence:''},{...blank,passage:'[BLANK] [BLANK]'},{...writing,givenWords:['make']},{...writing,passage:'Invented sentence.'},null])assert.equal(validateClassExercises([invalid],sentence).length,0);
 assert.deepEqual(validateClassExercises(undefined,sentence),[]);
});
