import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {unzipSync,strFromU8} from 'fflate';
import XLSX from 'xlsx';
import worker from '../worker.js';
fs.mkdirSync('.wrangler/eval-test',{recursive:true});
await build({stdin:{contents:`export * from './evaluation/app/lib/excel-report.ts'; export * from './evaluation/app/lib/mass-report-excel.ts'; export * from './evaluation/app/lib/excel-import.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.wrangler/eval-test/excel.mjs'});
const excel=await import('../.wrangler/eval-test/excel.mjs');
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('database/schema.sql','utf8')); db.exec(fs.readFileSync('evaluation/schema.sql','utf8'));
db.exec(`INSERT INTO techops_users(id,username,password_hash,password_salt,display_name,role) VALUES(1,'admin@local','x','x','관리자','admin'),(2,'member@local','x','x','회원','member'); INSERT INTO techops_sessions(id,user_id,expires_at) VALUES('admin',1,datetime('now','+1 day')),('member',2,datetime('now','+1 day'));`);
class Statement {
  constructor(sql){this.sql=sql;this.params=[]} bind(...p){this.params=p;return this}
  async first(){return db.prepare(this.sql).get(...this.params)||null}
  async all(){return {results:db.prepare(this.sql).all(...this.params)}}
  async raw(){const s=db.prepare(this.sql);s.setReturnArrays(true);return s.all(...this.params)}
  async run(){const r=db.prepare(this.sql).run(...this.params);return {success:true,meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}
}
const env={DB:{prepare:sql=>new Statement(sql)}};
let checks=0;
const check=(name,ok)=>{assert.ok(ok,name);checks++};
async function call(name,method='GET',body,session='admin') {
  const response=await worker.fetch(new Request('https://local/api/evaluation/'+name,{method,headers:{cookie:'session='+session,'content-type':'application/json',origin:'https://local'},body:body?JSON.stringify(body):undefined}),env,{});
  const data=await response.json();return {status:response.status,...data};
}
check('site session identity',(await call('auth/session')).user.role==='admin');
check('unauthenticated request denied',(await call('evaluations','GET',undefined,'invalid')).status===401);
check('viewer cannot write',(await call('evaluations','POST',{evaluationType:'DOE',lotNo:'SYN-1',product:'SYNTHETIC'},'member')).status===403);
const seed={evaluationNo:'SYN-001',evaluationType:'DOE',product:'SYNTHETIC',formFactor:'M.2',partNo:'SYN-PART',quantity:100,smtLot:'SYN-SMT',lotCurrent:'SYN-LOT',planDateIn:'2026/09/30',stages:[{stage:'SMT (M010/M015)',inputQty:'100',outputQty:'98',failCode:'SYN*2',trackIn:'2026/09/30 08:00:00',trackOut:'2026/09/30 09:00:00'},{stage:'iARTs (M031)'}]};
let response=await call('manual','POST',seed);
check('manual creation with process yield: '+JSON.stringify(response),response.status===201 && response.evaluation.yieldRate===98);
const id=response.evaluation.id;
const timeline=(await call('timeline?evaluationId='+id)).timeline;
check('completed process stored',timeline.length===1 && timeline[0].status==='Hoàn thành');
response=await call('manual','POST',{...seed,evaluationId:id,stages:[{...seed.stages[0],id:timeline[0].id},{stage:'iARTs (M031)',inputQty:'98',outputQty:'96',trackIn:'2026/09/30 10:00:00',trackOut:'2026/09/30 11:00:00'}]});
check('manual update preserves completed process',response.status===200 && (await call('timeline?evaluationId='+id)).timeline.length===2);
response=await call('import','POST',{fileName:'synthetic.xlsx',evaluations:[{importMode:'process-history',lotNo:'SYN-LOT',timelines:[{stage:'Router (M033)',eventDate:'2026-09-30T12:00:00',status:'Hoàn thành',note:'Input: 96 · Output: 95'}]}]});
check('SEE LOT process append',response.status===200 && response.updated===1);
const items=(await call('timeline?evaluationId='+id)).timeline;
check('SEE LOT retains prior process data',items.length===3 && items[0].note.includes('Output: 98'));
check('history records changes',(await call('history')).history.length===3);
check('timeline post',(await call('timeline','POST',{evaluationId:id,stage:'RDT Test',eventDate:'2026-09-30',note:'RDT Total: 22 · RDT Pass: 22',status:'Hoàn thành'})).status===201);
const saved=(await call('evaluations')).evaluations[0];
check('timeline joined in evaluation list',saved.timelines.length===4);
check('evaluation update',(await call('evaluations','PATCH',{...saved,result:'PASS'})).evaluation.result==='PASS');
const mass={evaluationNo:'SYN-001',evaluationType:'1K',product:'SYNTHETIC',startStep:'SMT (M010/M015)',lots:[{partNo:'SYN-PART',lotNo:'SYN-MASS',quantity:1000,stages:{}}]};
const report=(await call('mass-reports','POST',mass)).report;
check('mass report create',report.quantity===1000);
check('mass report update',(await call('mass-reports','PATCH',{...mass,id:report.id,status:'Hold',reason:'synthetic'})).status===200);
check('mass report list',(await call('mass-reports')).reports.length===1);
check('account listing excludes credentials',(await call('users')).users.every(u=>!('password_hash' in u)));
check('evaluation editor permission',(await call('users','PATCH',{id:2,role:'editor',status:'approved'})).status===200);
check('editor can write',(await call('evaluations','POST',{evaluationType:'PFQ',lotNo:'SYN-PFQ',product:'SYNTHETIC'},'member')).status===201);
check('editor cannot grant permissions',(await call('users','GET',undefined,'member')).status===403);
check('site admin cannot be demoted',(await call('users','PATCH',{id:1,role:'viewer',status:'rejected'})).status===400);
check('cross origin mutation blocked',(await worker.fetch(new Request('https://local/api/evaluation/evaluations',{method:'POST',headers:{cookie:'session=admin',origin:'https://other'}}),env,{})).status===403);
const template=fs.readFileSync('evaluation/public/evaluation-report-template.xlsx');
const exported=excel.buildEvaluationReport(template,saved,items);
const outputArchive=unzipSync(exported),templateArchive=unzipSync(template);
check('evaluation Excel preserves template styles and media',Object.keys(templateArchive).filter(n=>/styles.xml|media\//.test(n)).every(n=>Buffer.from(outputArchive[n]).equals(Buffer.from(templateArchive[n]))));
check('evaluation Excel writes lot values',strFromU8(unzipSync(exported)['xl/worksheets/sheet2.xml']).includes('SYN-LOT'));
const massExcel=excel.buildMassReportExcel(report,['SMT (M010/M015)','iARTs (M031)']);
check('mass Excel is readable',XLSX.read(massExcel,{type:'array'}).SheetNames.length===1);
const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['No.','Product','EVAL TYPE','Part No','SMT Lot','Total Q\'ty','Lot Current','Status'],[''],['SYN-002','SYNTHETIC','DOE','SYN-PART','SYN-SMT',20,'SYN-EXCEL','Chờ thực hiện']]),'DOE');
const parsed=await excel.parseEvaluationWorkbook(new File([XLSX.write(book,{type:'buffer',bookType:'xlsx'})],'synthetic.xlsx'));
check('workbook importer parses synthetic evaluation',parsed.evaluations[0]?.lotNo==='SYN-EXCEL');
check('workbook API creates evaluation',(await call('import','POST',parsed)).created===1);
check('mass report deletion',(await call('mass-reports?id='+report.id,'DELETE')).status===200);
check('evaluation deletion',(await call('evaluations?id='+id,'DELETE')).status===200);
check('delete removes timeline',db.prepare('SELECT COUNT(*) AS n FROM qeval_evaluation_timeline WHERE evaluation_id=?').get(id).n===0);

// Language coverage: the screen is written in Vietnamese and translated by dictionary, so a new
// Vietnamese literal without Korean and English entries shows up untranslated (2026-10-02 check
// found about 200). Fragments only used in status comparisons, the language name and text that
// goes into generated Excel files are not shown as screen text.
await build({stdin:{contents:`export {translateDynamic} from './evaluation/app/i18n.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.wrangler/eval-test/i18n.mjs'});
const {translateDynamic}=await import('../.wrangler/eval-test/i18n.mjs');
const VIETNAMESE=/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèẻẽẹềếểễệìỉĩịòỏõọồốổỗộờớởỡợùủũụừứửữựỳỷỹỵ]/i;
const notScreenText=new Set(['hoàn thành','trễ','đang','chờ phê duyệt','Đang','chờ','đã','Tiếng Việt']);
const {transform}=await import('esbuild');
const untranslated=[];
for(const file of ['evaluation/app/page.tsx',...fs.readdirSync('evaluation/app/api').map(d=>`evaluation/app/api/${d}/route.ts`),'evaluation/app/lib/excel-import.ts']){
  const {code}=await transform(fs.readFileSync(file,'utf8'),{loader:file.endsWith('x')?'tsx':'ts',jsx:'automatic',charset:'utf8'});
  for(const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)){let text;try{text=JSON.parse(`"${m[1]}"`).trim()}catch{continue}
    if(VIETNAMESE.test(text)&&!notScreenText.has(text)&&(translateDynamic(text,'ko')===text||translateDynamic(text,'en')===text))untranslated.push(text)}
}
check('every Vietnamese screen literal has Korean and English text: '+[...new Set(untranslated)].join(' / '),untranslated.length===0);
const historyLine='Tạo Lot thủ công · 3 công đoạn cập nhật · 3 công đoạn Track Out';
check('stored history sentence translated',!VIETNAMESE.test(translateDynamic(historyLine,'ko'))&&!VIETNAMESE.test(translateDynamic(historyLine,'en')));
check('split page counter translated',translateDynamic('Hiển thị 1 - 4 của 4 bản ghi','ko')==='1-4 / 전체 4건');

// Host page: the frame fills the area under the header (no second page scrollbar) and grows to
// the whole window while a Q-EVAL dialog is open.
const host=await (await worker.fetch(new Request('https://local/tasks?section=list',{headers:{cookie:'session=admin; lang=ko'}}),env,{})).text();
check('evaluation host page uses the full-height frame',host.includes('main class="evaluation-main"')&&host.includes('evaluation-frame')&&!host.includes('evaluation-host-note'));
check('evaluation host enlarges the frame for dialogs',host.includes('qeval:dialog')&&host.includes('is-dialog'));
check('legacy task list moved into the sidebar',host.includes('href="/tasks/legacy" class="sidebar-subnav-legacy'));
// Dark theme: generated after the untouched light sheet, repeats colors in the original order and
// keeps grays on the navy hue (a hue-0 gray once turned the mass sheet grid lines red).
const {buildDarkTheme}=await import('./dark-theme.mjs');
const {clientCss}=await import('./generated/assets.js');
const dark=buildDarkTheme('.card{background:#fff;color:#172033}.bar.a{background:#f0eaff}.bar.a{background:#7657dc}.grid{border:1px solid #808080!important}@media(max-width:700px){.card{border-bottom:1px solid #e8ebf1}}');
check('dark theme follows the system setting',dark.startsWith('@media screen and (prefers-color-scheme:dark){:root{color-scheme:dark}'));
check('white card becomes a dark surface with light text',/\.card\{background:#1[0-9a-f]{5};color:#[c-f][0-9a-f]{5}\}/.test(dark));
check('a later solid fill still wins over an earlier pale tint',dark.indexOf('.bar.a{background:rgba(')<dark.indexOf('.bar.a{background:#7657dc}'));
const grid=dark.match(/\.grid\{border:1px solid #([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})!important\}/);
check('gray grid lines get the navy hue, not red, and keep !important',!!grid&&parseInt(grid[3],16)>parseInt(grid[1],16));
check('width media rules are carried into the dark block',dark.includes('@media(max-width:700px){.card{border-bottom:1px solid #'));
check('overview toolbar stays under the title so it cannot cover the entry buttons on wide screens',
  clientCss.lastIndexOf('margin-top:-66px') < clientCss.indexOf('.qualification-toolbar{margin-top:0;'));
check('bundled stylesheet ends with the dark block',clientCss.lastIndexOf('@media screen and (prefers-color-scheme:dark)')>140000);
const frameDoc=await (await worker.fetch(new Request('https://local/evaluation/app?section=list',{headers:{cookie:'session=admin; lang=ko'}}),env,{})).text();
check('evaluation frame declares light and dark color schemes',frameDoc.includes('<meta name="color-scheme" content="light dark">'));

db.close(); console.log(`Evaluation port: ${checks} passed, 0 failed (synthetic local data only).`);
