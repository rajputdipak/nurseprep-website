const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../../node_modules/typescript');
const Papa = require('../../node_modules/papaparse');
const filename = path.resolve('lib/question-import.ts');
const js = ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(js, filename);
const { parseQuestionCsv } = mod.exports;
const sample = {subject:'Medical-Surgical Nursing',question:'A question with a comma,\nand a new line?',option_a:'a',option_b:'b',option_c:'c',option_d:'d',correct_answer:' B ',explanation:'Rationale, with quotes "example"'};
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS '+name); };
check('BOM, commas, quotes and newlines preserve imported content',()=>{
 const {rows,errors}=parseQuestionCsv('\uFEFF'+Papa.unparse([sample]));
 assert.deepEqual(errors,[]);assert.equal(rows[0].question_text,sample.question);assert.equal(rows[0].explanation,sample.explanation);assert.equal(rows[0].correct_answer,'b');
});
check('10000-question upload is validated in full',()=>{
 const fixture=Array.from({length:10000},(_,i)=>({...sample,question:'Fixture '+i}));
 const {rows,errors}=parseQuestionCsv(Papa.unparse(fixture)); assert.equal(rows.length,10000);assert.deepEqual(errors,[]);
});
check('question_text header accepted',()=>{
 const {question,...rest}=sample;const {rows,errors}=parseQuestionCsv(Papa.unparse([{...rest,question_text:question}]));assert.deepEqual(errors,[]);assert.equal(rows[0].question_text,question);
});
check('Blank lines and trimmed case-insensitive headers supported',()=>{
 const text=Papa.unparse([sample]).replace('subject,question,',' SUBJECT , QUESTION ,');const {errors}=parseQuestionCsv(text+'\r\n\r\n');assert.deepEqual(errors,[]);
});
check('Invalid answer is reported before upload',()=>assert.ok(parseQuestionCsv(Papa.unparse([{...sample,correct_answer:'e'}])).errors.some(e=>e.includes('a/b/c/d'))));
check('Missing required values are rejected',()=>assert.ok(parseQuestionCsv(Papa.unparse([{...sample,option_a:' '}])).errors.some(e=>e.includes('option_a'))));
check('Malformed CSV columns do not silently truncate',()=>assert.ok(parseQuestionCsv(Papa.unparse([sample])+',extra').errors.length));
check('Empty file is rejected',()=>assert.ok(parseQuestionCsv('').errors.length));
check('More than 10000 rows has a clear error',()=>assert.ok(parseQuestionCsv(Papa.unparse(Array.from({length:10001},()=>sample))).errors.some(e=>e.includes('10,000'))));
console.log(`${checks} CSV regression checks passed.`);
