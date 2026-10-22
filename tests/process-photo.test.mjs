import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/process-document/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function setup(overrides={}){let handler,requestBody;const analysis={level:'B1',topic:'t',summary:'s',structure:'s',sections:[{id:4,label:'A',role:'a'},{id:8,label:'B',role:'b'}],sentences:[{id:4,paragraph:4,english:'Hello.',korean:'안녕.',keywords:[]},{id:9,paragraph:8,english:'Goodbye.',korean:'잘 가.',keywords:[]}],questions:[],source_exam:{kind:'exam',questionType:'주제',rawText:'한글 질문 원문',questions:[{label:'1',questionType:'주제',prompt:'다음 글의 주제로 적절한 것은?',options:['① 가','② 나','③ 다','④ 라','⑤ 마']}]}};
vm.runInNewContext(code,{Deno:{env:{get:()=> 'test'},serve:fn=>{handler=fn}},createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})}}),fetch:async(_url,options)=>{requestBody=JSON.parse(options.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({...analysis,...overrides})}]}}]})},Response,Request,AbortController,console,setTimeout,clearTimeout});return {call:body=>handler(new Request('https://test.local',{method:'POST',body:JSON.stringify(body),headers:{Authorization:'Bearer test'}})),getRequest:()=>requestBody};}
test('photo analysis forwards a validated image, preserves original five options and forces compact paragraphs',async()=>{
 const ctx=setup();const response=await ctx.call({action:'analyze',text:'Learning a new language opens a window to the world. 다음 글의 주제는?',imageDataUrl:'data:image/jpeg;base64,AAAA',compactReading:true});assert.equal(response.status,200);const data=await response.json();assert.equal(data.analysis.sections.length,1);assert.equal(data.analysis.sentences[1].paragraph,1);assert.equal(data.analysis.source_exam.questions[0].options.length,5);const request=ctx.getRequest();assert.equal(request.contents[0].parts[1].inlineData.mimeType,'image/jpeg');assert.equal(request.contents[0].parts[1].inlineData.data,'AAAA');assert.match(request.contents[0].parts[0].text,/①~⑤/);assert.match(request.contents[0].parts[0].text,/판독 불가/);
});
test('invalid images are rejected before a model request; ordinary text remains supported',async()=>{
 const ctx=setup();let response=await ctx.call({action:'analyze',text:'A valid English passage with more than forty characters for testing.',imageDataUrl:'https://example.com/photo'});assert.equal(response.status,400);assert.equal(ctx.getRequest(),undefined);response=await ctx.call({action:'analyze',text:'A valid English passage with more than forty characters for testing.'});assert.equal(response.status,200);assert.equal(ctx.getRequest().contents[0].parts.length,1);
});
test('class generation forwards notes separately and requests both grounded exercise types',async()=>{
 const ctx=setup();const response=await ctx.call({action:'analyze',text:'The teacher made the lesson memorable for every student.',classExercises:true,notesText:'memorable에 밑줄, 5형식',noteImages:['data:image/jpeg;base64,AAAA'],classInstructions:'목적격보어 형용사'});
 assert.equal(response.status,200);const req=ctx.getRequest();assert.equal(req.contents[0].parts[1].inlineData.data,'AAAA');
 const prompt=req.contents[0].parts[0].text;assert.match(prompt,/5형식/);assert.match(prompt,/근거 없는 조건은 만들지/);assert.match(prompt,/definition_blank/);assert.match(prompt,/guided_writing/);assert.match(prompt,/필기를 source_exam.rawText에 합치지/);
 assert.ok(req.generationConfig.responseJsonSchema.required.includes('class_exercises'));
});
test('rejects unsafe or excessive notes payload before upstream request',async()=>{
 for(const notes of [{noteImages:['https://example.com/image.png']},{noteImages:Array(9).fill('data:image/png;base64,AAAA')},{notesText:'x'.repeat(120001)},{classInstructions:'x'.repeat(2001)}]){
 const ctx=setup();const res=await ctx.call({action:'analyze',text:'A source passage long enough to validate this input.',...notes});assert.equal(res.status,400);assert.equal(ctx.getRequest(),undefined);
 }
});

test('unreadable notes-only input fails clearly, even when optional class exercises are disabled',async()=>{
 const ctx=setup({sentences:[]});const response=await ctx.call({action:'analyze',text:'A placeholder for the attached handwritten notes without readable English.',notesText:'5형식',noteImages:['data:image/jpeg;base64,AAAA'],notesOnly:true,classExercises:false});
 assert.equal(response.status,422);assert.match((await response.json()).error,/영어 본문을 읽지 못/);const req=ctx.getRequest();assert.match(req.contents[0].parts[0].text,/원문 파일 없이 필기본만/);assert.equal(req.generationConfig.responseJsonSchema.properties.sentences.minItems,0);
});

test('class material exercises discard passage-only questions when notes were supplied',async()=>{
 const exercise={kind:'guided_writing',basis:'passage',evidence:'Hello.',answer:'Hello.'};const c=setup({class_exercises:[exercise,{...exercise,basis:'notes',evidence:'5형식'}]});const r=await c.call({action:'analyze',text:'A source passage long enough to validate the input.',notesText:'5형식',classExercises:true});assert.equal(r.status,200);const data=await r.json();assert.equal(data.analysis.class_exercises.length,1);assert.equal(data.analysis.class_exercises[0].basis,'notes');
});
