import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesLibraryKind,isCollection} from '../src/features/library/library-location.ts';
import {readWorkspaceHistory} from '../src/hooks/useWorkspaceHistory.ts';
test('reading and collection filters distinguish both current and legacy collection types',()=>{
 const reading={source_type:'text',analysis:{}};const collection={source_type:'text',analysis:{collection:{wordCount:5}}};const legacy={source_type:'vocabulary_collection',analysis:{}};
 assert.equal(isCollection(reading),false);assert.equal(isCollection(collection),true);assert.equal(isCollection(legacy),true);
 assert.equal(matchesLibraryKind(collection,'readings'),false);assert.equal(matchesLibraryKind(reading,'collections'),false);assert.equal(matchesLibraryKind(collection,'all'),true);
});
test('history rejects another account and malformed destinations',()=>{
 const entry={owner:'user-1',index:2,location:{view:'words',documentId:'doc',infoPage:null,library:{folderId:'folder',kind:'collections'},uploadFolderId:null,uploadMode:'file'}};
 assert.deepEqual(readWorkspaceHistory({moonwordsNavigationV1:entry},'user-1'),entry);
 assert.equal(readWorkspaceHistory({moonwordsNavigationV1:entry},'user-2'),null);
 assert.equal(readWorkspaceHistory(null,'user-1'),null);
 for(const patch of [{view:'bad'},{library:{kind:'bad',folderId:'f'}},{uploadMode:'bad'},{infoPage:'bad'}]) assert.equal(readWorkspaceHistory({moonwordsNavigationV1:{...entry,location:{...entry.location,...patch}}},'user-1'),null);
});
