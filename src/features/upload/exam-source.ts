import type { DocumentAnalysis, SourceExam } from '../../types';
export const EXAM_TYPES = ['목적','심경·분위기','주장','함축 의미','요지','주제','제목','도표','내용 불일치','내용 일치','어법','어휘','빈칸 추론','글의 순서','문장 삽입','무관한 문장','요약문 완성','장문 독해','기타'] as const;
export function classifyExam(text: string): string | null {
 text=text.replace(/([가-힣])\s+(?=[가-힣])/g,'$1');
 const rules: [RegExp,string][] = [
 [/들어가기에[\s\S]{0,15}순서|글의\s*순서|순서로[\s\S]{0,10}적절|이어질[\s\S]{0,12}순서/,'글의 순서'],[/문장[\s\S]{0,12}들어가|문장[\s\S]{0,12}넣기|주어진\s*문장/,'문장 삽입'],[/무관한|관계없는\s*문장/,'무관한 문장'],[/요약[\s\S]{0,30}빈칸|요약문/,'요약문 완성'],[/빈칸|blank/,'빈칸 추론'],[/어법|grammatically/,'어법'],[/낱말[\s\S]{0,20}적절하지|문맥상[\s\S]{0,20}(의미|쓰임)|어휘/,'어휘'],[/일치하지|다른\s*것|옳지\s*않/,'내용 불일치'],[/일치하는|내용과[\s\S]{0,8}일치/,'내용 일치'],[/의미하는\s*바|함축/,'함축 의미'],[/목적/,'목적'],[/심경|분위기/,'심경·분위기'],[/주장/,'주장'],[/요지/,'요지'],[/주제/,'주제'],[/제목/,'제목'],[/도표|그래프/,'도표'],[/장문|\[\d+\s*[~～–-]\s*\d+\]/,'장문 독해']];
 return rules.find(([rule])=>rule.test(text))?.[1] ?? (/[①②③④⑤]|다음\s*글|모의고사|수능/.test(text) ? '기타' : null);
}
export function preserveExamSource(analysis: DocumentAnalysis, text: string, compact = false, useVisionText = false): DocumentAnalysis {
 const candidate = analysis.source_exam;
 const type = classifyExam(text);
 const isExam = candidate?.kind === 'exam' || Boolean(type);
 const questions = Array.isArray(candidate?.questions) ? candidate.questions.filter(q=>q && typeof q.prompt==='string' && Array.isArray(q.options) && q.options.every(o=>typeof o==='string')).map(q=>({...q,label:String(q.label??''),questionType:EXAM_TYPES.includes(q.questionType as typeof EXAM_TYPES[number]) ? q.questionType : classifyExam(q.prompt) ?? type ?? '기타'})) : [];
 const source: SourceExam = {kind:isExam?'exam':'reading',questionType:isExam ? (EXAM_TYPES.includes(candidate?.questionType as typeof EXAM_TYPES[number])?candidate!.questionType:questions[0]?.questionType ?? type ?? '기타'):'일반 독해',rawText:useVisionText&&typeof candidate?.rawText==='string'&&candidate.rawText.trim().length>=40?candidate.rawText.trim():text,ocrText:text,questions};
 return {...analysis,source_exam:source,...(compact||isExam?{sections:[{id:1,label:isExam?'모의고사 본문':'본문',role:isExam?'원본 지문':'전체 본문'}],sentences:analysis.sentences.map(s=>({...s,paragraph:1}))}:{})};
}
