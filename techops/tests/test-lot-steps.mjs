import { read, utils, write } from 'xlsx/xlsx.mjs';
import { summarizeStepVisits, selectedSteps, stepReportMatrix, stepReportWorkbook, STEP_ROUTES, withoutCancelledEvents, followUpRows } from '../src/modules/lot/lot-step-report.js';
import { summarizeSeeLotWorkbook, validateTrackerPayload, resolveTrackerSummaries } from '../src/modules/lot/lot-tracker.js';
import worker from '../worker.js';

export async function testLotSteps({ check, env, viewerHeaders }) {
  const event = (eventName, dateTime, qty, step = 'M055', extra = {}) => ({ eventName, dateTime, qty, step, eqp: 'EQP-01', ...extra });
  const events = [
    event('TrackIn', '2026-09-20 12:00', '98'),
    event('TrackOut', '2026-09-20 11:00', '98'),
    event('Scrap', '2026-09-20 10:30', '98', 'M055', { changedQty: '2', comment: 'FAIL/description' }),
    event('TrackIn', '2026-09-20 10:00', '100'),
    event('TrackOut', '2026-09-20 09:00', '100', 'M050'),
    event('TrackIn', '2026-09-20 09:00', '100', 'M050'),
    event('TrackOut', '2026-09-20 08:00', '6', 'M015'),
    event('TrackIn', '2026-09-20 07:00', '6', 'M010'),
  ];
  const steps = summarizeStepVisits(events);
  check('step report does not pair a new Track In with a previous visit Track Out', steps.M055.length === 2 && steps.M055[1].in === '98' && steps.M055[1].out === '' && steps.M055[1].yld === '' && steps.M055[1].state === 'running');
  check('completed visit keeps its own scrap and yield', steps.M055[0].failQty === '2' && steps.M055[0].failCodes === 'FAIL*2' && steps.M055[0].yld === '98.0%');
  check('same-minute See LOT rows pair in source order', steps.M050.length === 1 && steps.M050[0].state === 'completed' && steps.M050[0].yld === '100.0%');
  check('Track Out without Track In has no invented input or yield', steps.M015[0].in === '' && steps.M015[0].yld === '' && steps.M015[0].state === 'outOnly');
  const repeated = summarizeStepVisits([event('TrackIn', '2026-09-20 11:00', '3'), event('TrackIn', '2026-09-20 10:00', '3')]);
  check('repeated Track In preserves missing Track Out in earlier visit', repeated.M055[0].state === 'interrupted' && repeated.M055[1].state === 'running');
  const cancelled = [event('TrackInCancel', '2026-09-20 12:00', '98'), event('TrackIn', '2026-09-20 11:00', '98'), event('TrackOut', '2026-09-20 10:00', '100'), event('TrackIn', '2026-09-20 09:00', '100')];
  const cancelledSteps = summarizeStepVisits(cancelled);
  check('cancel history and its cancelled Track In visit are excluded', withoutCancelledEvents(cancelled).length === 2 && cancelledSteps.M055.length === 1 && cancelledSteps.M055[0].in === '100' && cancelledSteps.M055[0].out === '100');
  const header = 'EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n';
  const csv = header + 'TrackOut,2026-09-20 11:00,98,M055,EQP-01,VMDL,0001,,,0,\nTrackIn,2026-09-20 10:00,100,M055,EQP-01,VMDL,0001,,,0,\n';
  const summary = summarizeSeeLotWorkbook(new TextEncoder().encode(csv), 'MODULE.csv');
  summary.steps = steps;
  const payload = JSON.stringify([summary]);
  check('step visits survive validated report payload', validateTrackerPayload(payload)[0].steps.M055[1].state === 'running');
  const form = new FormData(); form.set('route', 'MDL');
  const mdl = selectedSteps(form, [summary]);
  check('Module route combines M010 and M015 as one SMT selection', mdl.selected.join(',') === STEP_ROUTES.MDL.join(',') && mdl.selected.filter(step => step === 'SMT').length === 1 && !mdl.selected.includes('M010') && !mdl.selected.includes('M015'));
  form.set('route', 'SSD');
  const ssd = selectedSteps(form, [summary]);
  check('SSD route places SMT immediately before M033', ssd.options.indexOf('SMT') + 1 === ssd.options.indexOf('M033'));
  check('SSD route exposes M100 and M111 separately and preserves observed extra steps', ssd.options.includes('M100') && ssd.options.includes('M111') && ssd.options.includes('M055'));
  form.delete('route');
  check('automatic step order places SMT before M033', selectedSteps(form, [{ ...summary, steps: { M033: [], M010: [], M015: [], M031: [] } }]).options.join(',') === 'M031,SMT,M033');
  form.set('route', 'SSD');
  form.set('selection', '1'); form.append('steps', 'M055');
  check('step selection restricts report columns', selectedSteps(form, [summary]).selected.join() === 'M055');
  form.delete('steps');
  check('empty explicit selection remains empty', selectedSteps(form, [summary]).selected.length === 0);
  form.append('steps', 'INVALID'); let rejected = false;
  try { selectedSteps(form, [summary]); } catch { rejected = true; }
  check('unknown report steps are rejected', rejected);
  const matrix = stepReportMatrix([summary], ['M055']);
  check('step report shows latest visit without stale previous completion', matrix[0][3] === 'M055' && matrix[2][4] === '98' && matrix[2][5] === '' && matrix[2][8] === '');
  const smtMatrix = stepReportMatrix([summary], ['SMT']);
  check('SMT uses M010 Track In and M015 Track Out as a single report step', smtMatrix[0][3] === 'SMT' && smtMatrix[2][4] === '6' && smtMatrix[2][5] === '6' && smtMatrix[2][8] === '100.0%');
  check('step report labels use FAIL quantity and SCRAP code without per-step state', matrix[1].join(',') === ',,,EQP,IN,OUT,FAIL,SCRAP,YLD' && !matrix.flat().includes('State'));
  const book = read(stepReportWorkbook([summary], ['M055'], 'ko'), { type: 'array' });
  const history = utils.sheet_to_json(book.Sheets['Track History'], { header: 1 });
  check('step Excel includes selected report, scrap summary, visit history, follow-up and split flow', book.SheetNames.join(',') === 'LOT Steps,Scrap Summary,Track History,LOT Follow-up,LOT Split Flow' && history.length === 3 && history[1][1] === 'M055' && history[2][5] === '98');

  const rootCsv = header + 'Split,2026-09-21 08:00,11,M060,-,VMDL,0001,,CHILD-LOT,48,\nModifyAttrh,2026-09-20 08:00,59,M033,-,VMDL,0001,ASSYLOT,/PARENT-LOT,0,\n';
  const childCsv = header + 'Split,2026-09-21 08:00,48,M060,-,VMDL,0001,,PARENT-LOT,48,\n';
  const root = summarizeSeeLotWorkbook(new TextEncoder().encode(rootCsv), '11111111-1111-1111-1111-111111111111.csv');
  const child = summarizeSeeLotWorkbook(new TextEncoder().encode(childCsv), '22222222-2222-2222-2222-222222222222.csv');
  resolveTrackerSummaries([root, child]);
  check('UUID downloads resolve actual LOTIDs from ASSYLOT and reciprocal Split history', root.lotId === 'PARENT-LOT' && root.lotIdSource === 'ASSYLOT' && child.lotId === 'CHILD-LOT' && child.lotIdSource === 'Split PARENT-LOT');

  const fullySplitCsv = header
    + 'Terminated,2026-09-20 11:18,0,M010,-,VMDL,AUTOI,,,0,\n'
    + 'Split,2026-09-20 11:18,0,M010,-,VMDL,AUTOI,,H133030638,6,\n'
    + 'Split,2026-09-20 10:52,6,M010,-,VMDL,AUTOI,,H133020638,6,\n'
    + 'Split,2026-09-20 10:36,12,M010,-,VMDL,AUTOI,,H133010638,6,\n';
  const fullySplit = summarizeSeeLotWorkbook(new TextEncoder().encode(fullySplitCsv), '33333333-3333-3333-3333-333333333333.csv');
  resolveTrackerSummaries([fullySplit]);
  check('LOTID sequence alone never fabricates a parent LOTID', fullySplit.lotId === '33333333-3333-3333-3333-333333333333' && fullySplit.lotIdSource === 'filename');
  check('fully split flow still lists an outgoing split not recorded as this LOT\'s own origin', followUpRows([fullySplit]).some(row => row.lotId === 'H133020638'));

  const mapHeaders = ['No', 'REPRSN_SRLNO', 'LOT_ID', 'BARCODE_SERLNO', 'PROD_ID', 'SPLIT_LOT', 'RESERVE_ID', 'PS_PROC', 'FW_PROC', 'TEST_RESULT', 'PCB_ARRAY', 'MERGE_LOT', 'PCB_MAP', 'WORK_NAME', 'FRONT_RESULT', 'BACK_RESULT', 'FRONT_SCRAP_CODE', 'BACK_SCRAP_CODE', 'CREATE_DATE'];
  const mapBook = utils.book_new();
  utils.book_append_sheet(mapBook, utils.aoa_to_sheet([
    mapHeaders,
    ['1', 'S1', 'H16A000638', 'S1', 'PART-01', 'H16A010638', '-', '0', '0', '', '6', 'H16A030638', '111111AA', 'S_AOI', '111111AA', '111111AA', '', '', '20260920 151825'],
    ['2', 'S2', 'H16A000638', 'S2', 'PART-01', 'H16A020638', '-', '0', '0', '', '6', 'H16A030638', '111111AA', 'S_AOI', '111111AA', '111111AA', '', '', '20260920 151843'],
    ['3', 'S3', 'H16A000638', 'S3', 'PART-01', 'H16A030638', '-', '0', '0', '', '6', 'H16A030638', '111111AA', 'S_AOI', '111111AA', '111111AA', '', '', '20260920 151858'],
  ]), 'Sheet1');
  const mapped = summarizeSeeLotWorkbook(new Uint8Array(write(mapBook, { type: 'array', bookType: 'xlsx' })), '44444444-4444-4444-4444-444444444444.xls');
  check('PCB split map export is metadata only, not process history or lineage evidence', mapped.lotId === 'H16A000638' && mapped.mergeTarget === 'H16A030638' && mapped.relations.length === 0 && mapped.initialQty === '' && mapped.partNumber === 'PART-01' && mapped.status === 'RUNID map (not process history)');
  root.recycles = [{ lotId: 'RECYCLE-LOT', qty: '1', dateTime: '2026-09-21 08:30', step: 'M060' }];
  const followUp = followUpRows([root, child]);
  check('follow-up list includes uploaded, split and recycle LOTIDs without duplicates', new Set(followUp.map(row => row.lotId)).size === followUp.length && followUp.some(row => row.lotId === 'CHILD-LOT') && followUp.some(row => row.lotId === 'RECYCLE-LOT'));
  const post = async (action, selected) => {
    const body = new FormData(); body.set('action', action); body.set('reportMode', 'steps'); body.set('payload', payload); body.set('selection', '1'); body.set('route', 'MDL');
    for (const step of selected) body.append('steps', step);
    return worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body, headers: viewerHeaders }), env, {});
  };
  let response = await post('select', ['M055']); let html = await response.text();
  check('step choices render as toggle chips inside the selection form', html.includes('<label class="lot-step-chip"><input type="checkbox" name="steps" value="M055" checked>M055</label>'));
  check('members can change report steps without uploading files again', response.status === 200 && html.includes('colspan="6">M055') && !html.includes('colspan="6">M050') && html.includes('name="steps" value="M055" checked') && !html.includes('<th>State</th>'));
  response = await post('download', ['M055']);
  const selectedBook = read(new Uint8Array(await response.arrayBuffer()), { type: 'array' });
  const selectedRows = utils.sheet_to_json(selectedBook.Sheets['LOT Steps'], { header: 1 });
  check('HTTP Excel download uses the same selected steps as the screen', response.status === 200 && selectedRows[0][3] === 'M055' && !selectedRows[0].includes('M050'));
  response = await post('select', []); html = await response.text();
  check('empty step selection gives recoverable selection form', response.status === 200 && html.includes('id="step-selection"') && !html.includes('name="action" value="download"'));
  response = await post('download', []);
  check('empty step selection cannot generate a misleading Excel report', response.status === 400);
  // The fixed-format report showed the follow-up table and its Excel sheet in English on every
  // screen language (2026-10-04); the step-format report already followed the language.
  const postFixed = (action, lang) => {
    const body = new FormData(); body.set('action', action); body.set('reportMode', 'fixed'); body.set('payload', payload);
    return worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body, headers: { cookie: `${viewerHeaders.cookie}; lang=${lang}` } }), env, {});
  };
  for (const [lang, header] of [['ko', '우선순위'], ['en', 'Priority'], ['vi', 'Ưu tiên']]) {
    html = await (await postFixed('select', lang)).text();
    response = await postFixed('download', lang);
    const followUpSheet = read(new Uint8Array(await response.arrayBuffer()), { type: 'array' }).Sheets['LOT Follow-up'];
    check(`fixed report follow-up table and Excel sheet use the screen language (${lang})`,
      html.includes(`<th>${header}</th>`) && utils.sheet_to_json(followUpSheet, { header: 1 })[0][0] === header);
  }
}
