import assert from 'node:assert/strict';
import { summarizeSeeLotWorkbook, summarizeRunMetadata, assignRunLinks, resolveTrackerSummaries, originLotIds } from './lot-tracker.js';
import { stepOptions, tracerReportMatrix } from './lot-step-report.js';
import { trackingLists } from './tracking.mjs';

function csv(text) { return new TextEncoder().encode(text); }

// Child LOT CHILD-001 was born from a single full-quantity M010 split out of PARENT-999.
const childEvents = 'EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n'
  + 'TrackOut,2026-09-20 12:00,100,M050,EQP-02,VMDL,0001,,,0,\n'
  + 'TrackIn,2026-09-20 11:00,100,M050,EQP-02,VMDL,0001,,,0,\n'
  + 'Split,2026-09-20 10:00,100,M010,,,0001,,PARENT-999,100,\n';
const childSummary = summarizeSeeLotWorkbook(csv(childEvents), 'CHILD-001.csv');
assert.equal(childSummary.lotId, 'CHILD-001');
assert.equal(originLotIds(childSummary).length, 1);
assert.equal(originLotIds(childSummary)[0], 'PARENT-999');

// --- Case 1: direct RUNID link — the RUNID CSV itself names CHILD-001 as its MERGE_LOT.
const directRunCsv = 'LOT_ID,PROD_ID,MERGE_LOT\nPARENT-999,D1BP-XYZ,CHILD-001\n';
const directRun = summarizeRunMetadata(csv(directRunCsv), 'PARENT-999.csv');
assert.equal(directRun.lotId, 'PARENT-999');
assert.equal(directRun.partNumber, 'D1BP-XYZ');
assert.deepEqual(directRun.mergeLotIds, ['CHILD-001']);

{
  const summaries = resolveTrackerSummaries([structuredClone(childSummary)]);
  const { usedRunIds, unlinked } = assignRunLinks(summaries, [directRun]);
  assert.equal(summaries[0].runLinkType, 'direct');
  assert.equal(summaries[0].runSourceLotId, 'PARENT-999');
  assert.equal(summaries[0].partNumber, 'D1BP-XYZ');
  assert.equal(usedRunIds.has('PARENT-999'), true);
  assert.equal(unlinked.length, 0);
  const tracking = trackingLists(summaries);
  const smtRows = tracking.matrices['SMT RUNID 추적'];
  assert.ok(smtRows.some(row => row[0] === 'CHILD-001' && row[1] === 'PARENT-999' && /직접 연결 확인됨/.test(row[2])));
  const tracer = tracerReportMatrix(summaries, ['SMT']);
  assert.deepEqual(tracer[0].slice(0, 7), ['PART NO', 'SMT RUNID', 'QTY', 'PROC_ID', 'EVAL', 'TIER', 'OPT']);
  assert.deepEqual(tracer[2].slice(0, 2), ['D1BP-XYZ', 'PARENT-999']);
  assert.equal(tracer[0].length, 13, 'v3 SMT has six metrics and no standalone mutation columns');
  assert.deepEqual(tracer[1].slice(7), ['EQP', 'IN', 'OUT', 'SCRAP', 'FAIL', 'YLD']);
  console.log('PASS: direct RUNID link recognized and partNumber filled');
}

{
  const summaries = [{
    partNumber: 'PN-1', lotId: 'LOT-1', runLinkType: 'direct', runSourceLotId: 'RUN-1',
    relations: [
      { step: 'M010', eventName: 'Split', relatedLotId: 'LOT-2', changedQty: '100', dateTime: '2026-09-20 10:00' },
      { step: 'M015', eventName: 'Merge', relatedLotId: 'LOT-3', changedQty: '20', dateTime: '2026-09-20 12:00' },
    ],
  }];
  const tracer = tracerReportMatrix(summaries, ['SMT']);
  assert.equal(tracer.length, 3);
  assert.deepEqual(tracer[2].slice(0, 2), ['PN-1', 'RUN-1']);
  assert.equal(tracer[0].includes('Mutation'), false);
  assert.equal(summaries[0].relations.length, 2, 'SMT evidence remains available without expanding temporary array LOTs');
  console.log('PASS: confirmed SMT RUNID remains one v3 SMT summary');
}

{
  const summaries = [{
    partNumber: 'PN-1', lotId: 'LOT-1', steps: {},
    relations: [
      { step: 'M087', eventName: 'Split', relatedLotId: 'UNLOADED-1', changedQty: '4', dateTime: '2026-09-20 10:00' },
      { step: 'M087', eventName: 'Split', relatedLotId: 'UNLOADED-2', changedQty: '6', dateTime: '2026-09-20 10:01' },
      { step: 'M087', eventName: 'Merge', relatedLotId: 'UNLOADED-3', changedQty: '2', dateTime: '2026-09-20 10:02' },
    ],
  }];
  const tracer = tracerReportMatrix(summaries, ['M087']);
  assert.equal(tracer.length, 5, 'known mutations have one event per row');
  assert.deepEqual(tracer.slice(2).map(row => row.slice(7, 10)), [['SPLIT', 'UNLOADED-1', '4'], ['SPLIT', 'UNLOADED-2', '6'], ['MERGE', 'UNLOADED-3', '2']]);
  assert.ok(tracer.slice(2).every(row => row.slice(10).every(value => value === '')), 'unselected histories cannot create process metrics');
  assert.deepEqual(tracer.lotTrackerRowGroups, [{ start: 2, end: 4 }]);
  console.log('PASS: unselected LOT mutations are separate evidence rows without fabricated process histories');
}

// --- Case 2: indirect RUNID link — the RUNID CSV's MERGE_LOT points at an intermediate LOT
// (VIA-LOT), and VIA-LOT is what this summary's own history says it split from.
const childEvents2 = childEvents.replace('PARENT-999', 'VIA-LOT');
const childSummary2 = summarizeSeeLotWorkbook(csv(childEvents2), 'CHILD-002.csv');
const indirectRunCsv = 'LOT_ID,PROD_ID,MERGE_LOT\nPARENT-999,D1BP-XYZ,VIA-LOT\n';
const indirectRun = summarizeRunMetadata(csv(indirectRunCsv), 'PARENT-999.csv');
{
  const summaries = resolveTrackerSummaries([structuredClone(childSummary2)]);
  assignRunLinks(summaries, [indirectRun]);
  assert.equal(summaries[0].runLinkType, 'indirect');
  assert.equal(summaries[0].runSourceLotId, 'PARENT-999');
  assert.equal(summaries[0].runViaLotId, 'VIA-LOT');
  const tracking = trackingLists(summaries);
  const smtRows = tracking.matrices['SMT RUNID 추적'];
  assert.ok(smtRows.some(row => row[0] === 'CHILD-002' && /간접 연결 확인됨.*경유 LOT: VIA-LOT/.test(row[2])));
  console.log('PASS: indirect RUNID link recognized via intermediate LOT');
}

// --- Case 3: no RUNID CSV at all — falls back to the old "candidate" heuristic, unchanged.
{
  const summaries = resolveTrackerSummaries([structuredClone(childSummary)]);
  assignRunLinks(summaries, []);
  assert.equal(summaries[0].runLinkType, '');
  const tracking = trackingLists(summaries);
  const smtRows = tracking.matrices['SMT RUNID 추적'];
  assert.ok(smtRows.some(row => row[0] === 'CHILD-001' && row[1] === 'PARENT-999' && /RUNID CSV 없음 · 추정/.test(row[2])));
  console.log('PASS: candidate heuristic unchanged when no RUNID CSV is provided');
}

// --- Case 4: a RUNID CSV that can't be linked to anything uploaded is reported as unlinked.
{
  const summaries = resolveTrackerSummaries([structuredClone(childSummary)]);
  const unrelatedRun = summarizeRunMetadata(csv('LOT_ID,PROD_ID,MERGE_LOT\nOTHER-1,PN-1,SOMEWHERE-ELSE\n'), 'OTHER-1.csv');
  const { unlinked } = assignRunLinks(summaries, [unrelatedRun]);
  assert.equal(unlinked.length, 1);
  assert.equal(unlinked[0].lotId, 'OTHER-1');
  console.log('PASS: unrelated RUNID CSV reported as unlinked');
}

// --- Case 5: a CSV with unrelated headers is not mistaken for a RUNID file.
assert.equal(summarizeRunMetadata(csv('A,B,C\n1,2,3\n'), 'not-runid.csv'), null);
console.log('PASS: non-RUNID CSV header returns null instead of throwing');

// --- Case 6: descriptive filenames keep only the LOT token, and 2D barcode metadata
// feeds the requested fixed process report without inventing values.
{
  const rootEvents = headers => headers
    + 'TrackOut,2026-09-20 18:00,80,M060,IVI-01,L,U,,,0,\n'
    + 'TrackIn,2026-09-20 17:00,80,M060,IVI-01,L,U,,,0,\n'
    + 'TrackOut,2026-09-20 16:00,80,M055,PCT-02,L,U,,,0,\n'
    + 'TrackIn,2026-09-20 15:00,90,M055,PCT-02,L,U,,,0,\n'
    + 'Split,2026-09-20 14:30,80,M050,,L,U,,SPLIT-001,20,\n'
    + 'TrackOut,2026-09-20 14:00,80,M050,TH-01,L,U,,,0,\n'
    + 'Scrap,2026-09-20 13:30,80,M050,TH-01,L,U,,,10,CODE-A/detail\n'
    + 'TrackIn,2026-09-20 13:00,90,M050,TH-01,L,U,,,0,\n'
    + 'TrackOut,2026-09-20 12:00,100,M033,RT-01,L,U,,,0,\n'
    + 'TrackIn,2026-09-20 11:00,100,M033,RT-01,L,U,,,0,\n'
    + 'TrackOut,2026-09-20 10:40,6,M015,SM-2F2,L,U,,,0,\n'
    + 'TrackIn,2026-09-20 10:30,6,M015,SM-2F2,L,U,,,0,\n'
    + 'TrackOut,2026-09-20 10:20,6,M010,SM-2F1,L,U,,,0,\n'
    + 'TrackIn,2026-09-20 10:10,6,M010,SM-2F1,L,U,,,0,\n'
    + 'Split,2026-09-20 10:00,6,M010,,L,U,,PARENT-999,6,\n';
  const root = summarizeSeeLotWorkbook(csv(rootEvents('EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n')), 'CHILD-001 seelot.csv');
  assert.equal(root.lotId, 'CHILD-001');
  const split = summarizeSeeLotWorkbook(csv('EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n'
    + 'TrackOut,2026-09-20 20:00,19,M050,TH-02,L,U,,,0,\n'
    + 'Scrap,2026-09-20 19:30,19,M050,TH-02,L,U,,,1,CODE-B/detail\n'
    + 'TrackIn,2026-09-20 19:00,20,M050,TH-02,L,U,,,0,\n'), 'SPLIT-001.csv');
  const barcode = '1AAAAAAAAAAAAAAAAB0AAAAAAAAAAAAA';
  const map = summarizeRunMetadata(csv('LOT_ID,PROD_ID,MERGE_LOT,BARCODE_SERLNO,PCB_ARRAY\n'
    + `PARENT-999,PART-2D,CHILD-001,${barcode},50\nPARENT-999,PART-2D,CHILD-001,${barcode},50\n`), 'PARENT-999 2dbarcode.csv');
  const summaries = resolveTrackerSummaries([root, split]);
  assignRunLinks(summaries, [map]);
  // The unified report uses the v1.1.2 attribute policy: barcode positions do not establish TIER/OPT.
  assert.deepEqual([summaries[0].partNumber, summaries[0].fab, summaries[0].tier, summaries[0].opt, summaries[0].smtQuantity],
    ['PART-2D', 'B', '', '', '100']);
  const matrix = tracerReportMatrix(summaries, ['SMT', 'M033', 'M087', 'M100', 'M111', 'M130', 'M160', 'M164', 'M165']);
  assert.equal(matrix[0].length, 82);
  assert.equal(matrix[1].length, 82);
  assert.ok(matrix.slice(2).every(row => row.length === 82));
  console.log('PASS: shared 82-column report preserves PMS part/quantity and does not invent attributes');
}

// --- Case 7: a UUID-named M010 input issue whose complete Split quantities point
// to one 000-position parent is an SMT input RUN ID and needs one PMS lookup.
{
  const smtInputEvents = 'EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n'
    + 'Terminated,2026-09-21 10:03,0,M010,,L,U,,,0,\n'
    + 'Split,2026-09-21 10:02,0,M010,,L,U,,HABC020639,3,\n'
    + 'Split,2026-09-21 10:01,3,M010,,L,U,,HABC010639,3,\n'
    + 'ISSUE_VMS1_VMDL,2026-09-21 10:00,6,M010,,L,U,,,0,\n'
    + 'ModifyAttrh,2026-09-21 09:59,6,M010,,L,U,OPTCODE,7/J,0,\n'
    + 'ModifyAttrh,2026-09-21 09:58,6,M010,,L,U,EVALCODE,/S911,6,\n'
    + 'ModifyAttrh,2026-09-21 09:57,6,M010,,L,U,TIER,/0,6,\n';
  const summary = summarizeSeeLotWorkbook(csv(smtInputEvents), '11111111-2222-4333-8444-555555555555.csv');
  assert.equal(summary.lotId, 'HABC000639');
  assert.equal(summary.lotIdSource, 'M010 SMT input');
  assert.equal(summary.sourceKind, 'SMT input RUN ID');
  assert.equal(summary.smtInputRun, true);
  assert.equal(summary.pmsRequired, true);
  assert.equal(summary.smtInputQuantity, '6');
  assert.equal(summary.smtSplitCount, '2');
  assert.equal(summary.initialQty, '6');
  assert.deepEqual([summary.evalCode, summary.tier, summary.opt], ['S911', '0', 'J']);
  assert.deepEqual(stepOptions([summary]), ['SMT']);
  const tracking = trackingLists([summary]);
  assert.deepEqual(tracking.missing.map(row => [row.id, row.types]), [['HABC000639', 'PMS 정보']]);
  assert.match(tracking.missing[0].action, /PMS에서 RUN ID/);
  assert.ok(tracking.matrices['SMT RUNID 추적'].some(row => row[0] === 'HABC000639' && /PMS 정보 요청/.test(row[5])));
  assert.deepEqual(tracking.matrices['SPLIT LOT 목록'].slice(1).map(row => row[1]).sort(), ['HABC010639', 'HABC020639']);

  const parent = {
    lotId: 'PARENT-999', partNumber: 'PN-1',
    relations: [{ step: 'M033', eventName: 'Merge', relatedLotId: 'HABC020639', changedQty: '3', dateTime: '2026-09-21 11:00' }],
  };
  const pms = {
    lotId: 'HABC000639', mergeLotIds: ['PARENT-999'], tier: '', opt: '',
    pmsSplitRows: [
      { splitLotId: 'HABC010639', mergeLotId: 'HABC010639', quantity: '3' },
      { splitLotId: 'HABC020639', mergeLotId: 'HABC010639', quantity: '3' },
    ],
  };
  assignRunLinks([summary, parent], [pms]);
  assert.equal(parent.smtPmsFlow.validated, true);
  assert.deepEqual(tracerReportMatrix([summary, parent], ['SMT'])[2].slice(4, 7), ['S911', '0', 'J']);

  const incomplete = summarizeSeeLotWorkbook(csv(smtInputEvents.replace('HABC020639,3', 'HABC020639,2')), '11111111-2222-4333-8444-555555555555.csv');
  assert.equal(incomplete.smtInputRun, false);
  assert.notEqual(incomplete.lotId, 'HABC000639');
  const unrelatedName = summarizeSeeLotWorkbook(csv(smtInputEvents), 'OTHER-LOT.csv');
  assert.equal(unrelatedName.smtInputRun, false);
  console.log('PASS: evidence-complete M010 issue derives one SMT input RUN ID and requests PMS once');
}


// --- Report grouping regressions: one selected LOT contributes to one root group.
const reportVisitFixture = eqp => ({ eqp, in: '5', out: '5', failQty: '', failCodes: '', yld: '100.0%' });
const reportSummaryFixture = lotId => ({
  lotId, partNumber: 'PN-' + lotId, steps: { M087: [reportVisitFixture(lotId)] }, relations: [],
});
const reportRootFixture = (lotId, childId) => ({
  ...reportSummaryFixture(lotId),
  smtPmsFlow: { validated: true, runId: 'RUN-' + lotId, parentLotId: lotId, totalQuantity: '100', pmsRowCount: 2 },
  relations: [{ step: 'M087', eventName: 'Split', relatedLotId: childId, changedQty: '5', qty: '95', dateTime: '2026-09-22 10:00' }],
});
const reportEquipment = matrix => matrix.slice(2).map(row => row[10]).filter(Boolean);

{
  const rootA = reportRootFixture('ROOT-A', 'DETAIL-A');
  const rootB = reportRootFixture('ROOT-B', 'DETAIL-B');
  const matrix = tracerReportMatrix([rootA, rootB, reportSummaryFixture('DETAIL-A'), reportSummaryFixture('DETAIL-B')], ['M087']);
  assert.deepEqual(reportEquipment(matrix), ['ROOT-A', 'DETAIL-A', 'ROOT-B', 'DETAIL-B']);
  assert.deepEqual(matrix.slice(2).map(row => row[1]), ['RUN-ROOT-A', '', 'RUN-ROOT-B', '']);
  console.log('PASS: independent verified SMT roots include only their own analyzed detail LOTs');
}

{
  const root = reportRootFixture('ROOT-A', 'DETAIL-A');
  const selected = [root, reportSummaryFixture('DETAIL-A'), reportSummaryFixture('UNRELATED')];
  const matrix = tracerReportMatrix(selected, ['M087']);
  assert.deepEqual(reportEquipment(matrix), ['ROOT-A', 'DETAIL-A', 'UNRELATED']);
  assert.equal(matrix[4][0], 'PN-UNRELATED');
  const partial = tracerReportMatrix([root, reportSummaryFixture('UNRELATED')], ['M087']);
  assert.deepEqual(reportEquipment(partial), ['ROOT-A', 'UNRELATED']);
  assert.ok(partial.slice(2).some(row => JSON.stringify(row.slice(7, 10)) === JSON.stringify(['SPLIT', 'DETAIL-A', '5'])));
  console.log('PASS: unrelated selected histories are retained and missing detail files do not create rows');
}

{
  const root = reportRootFixture('ROOT-A', 'DETAIL-A');
  root.relations.push({ step: 'M033', eventName: 'Merge', relatedLotId: 'ARRAY-A', changedQty: '50', dateTime: '2026-09-22 09:00' });
  const input = {
    ...reportSummaryFixture('INPUT-A'), smtInputRun: true, smtPmsConsumedBy: 'ROOT-A',
    relations: [{ step: 'M010', eventName: 'Split', relatedLotId: 'ARRAY-A', changedQty: '50', dateTime: '2026-09-22 08:00' }],
  };
  const matrix = tracerReportMatrix([root, input, reportSummaryFixture('ARRAY-A'), reportSummaryFixture('DETAIL-A'), reportSummaryFixture('UNRELATED')], ['M087']);
  assert.deepEqual(reportEquipment(matrix), ['ROOT-A', 'DETAIL-A', 'UNRELATED']);
  assert.ok(!matrix.slice(2).some(row => row[0] === 'PN-INPUT-A' || row[0] === 'PN-ARRAY-A'));
  console.log('PASS: consumed SMT input and verified temporary arrays stay grouped without suppressing unrelated LOTs');
}

{
  const root = reportRootFixture('ROOT-A', 'DETAIL-A');
  const child = reportSummaryFixture('DETAIL-A');
  const grandchild = reportSummaryFixture('DETAIL-B');
  grandchild.relations.push({ step: 'M087', eventName: 'Split', relatedLotId: 'DETAIL-A', changedQty: '5', qty: '5', dateTime: '2026-09-22 11:00' });
  child.relations.push({ step: 'M087', eventName: 'Merge', relatedLotId: 'ROOT-A', changedQty: '5', dateTime: '2026-09-22 12:00' });
  const matrix = tracerReportMatrix([root, child, grandchild], ['M087']);
  assert.deepEqual(reportEquipment(matrix), ['ROOT-A', 'DETAIL-A', 'DETAIL-B']);
  console.log('PASS: transitive reciprocal detail history and cycles produce one row per analyzed LOT');
}

{
  const rootA = reportRootFixture('ROOT-A', 'SHARED');
  const rootB = reportRootFixture('ROOT-B', 'SHARED');
  const shared = reportSummaryFixture('SHARED');
  const matrix = tracerReportMatrix([rootA, rootB, shared], ['M087']);
  assert.deepEqual(reportEquipment(matrix), ['ROOT-A', 'ROOT-B', 'SHARED']);
  const sharedRow = matrix.slice(2).find(row => row[0] === 'PN-SHARED');
  assert.ok(sharedRow);
  assert.equal(sharedRow[1], '', 'ambiguous connections must not invent an SMT RUNID');
  console.log('PASS: a selected LOT connected to multiple roots is retained once without an invented root assignment');
}

{
  const root = reportRootFixture('ROOT-A', 'UNLOADED');
  const selected = reportSummaryFixture('SELECTED');
  selected.relations.push({ step: 'M087', eventName: 'Merge', relatedLotId: 'UNLOADED', changedQty: '5', dateTime: '2026-09-22 11:00' });
  const matrix = tracerReportMatrix([root, selected], ['M087']);
  assert.deepEqual(reportEquipment(matrix), ['ROOT-A', 'SELECTED']);
  assert.ok(matrix.slice(2).some(row => row[0] === 'PN-SELECTED'), 'unselected histories must not be inferred as a bridge to a verified root');
  console.log('PASS: unselected LOT references remain evidence and do not infer a root grouping');
}


{
  const selected = ['SMT', 'M033', 'M087', 'M100', 'M111', 'M130', 'M160', 'M164', 'M165'];
  const matrix = tracerReportMatrix([reportSummaryFixture('LAYOUT')], selected);
  assert.deepEqual(matrix[0].map((value, index) => value && index >= 7 ? [value, index] : null).filter(Boolean),
    [['SMT', 7], ['M033', 13], ['M087', 22], ['M100', 31], ['M111', 40], ['M130', 46], ['M160', 55], ['M164', 64], ['M165', 73]]);
  assert.deepEqual([13, 22, 31, 46, 55, 64, 73].map(index => matrix[1].slice(index, index + 3)),
    Array.from({ length: 7 }, () => ['Mutation', 'Change LOT', 'QTY']));
  assert.equal(matrix[0].includes('Mutation'), false);
  console.log('PASS: actual v3 process widths and mutation-first columns are exact');
}

{
  const summary = reportSummaryFixture('PRECISION');
  const visit = { eqp: 'EQP', in: '1000', out: '999', failQty: '', failCodes: '' };
  summary.steps = { M010: [visit], M015: [visit], M033: [visit], M100: [{ ...visit, out: '998' }] };
  const matrix = tracerReportMatrix([summary], ['SMT', 'M033', 'M100']);
  assert.equal(matrix[2][12], '0.998', 'SMT follows (OUT - FAIL) / IN without premature rounding');
  assert.equal(matrix[2][21], '0.998', 'M033 follows the reference formula without premature rounding');
  assert.equal(matrix[2][30], '0.998', 'M100 uses OUT / IN; 99.8% must not become 100%');
  console.log('PASS: 99.8 percent precision and the reference SMT/M033 yield formulas are preserved');
}

{
  const summary = reportSummaryFixture('ACTUAL-STEPS');
  summary.relations = [
    { step: 'M100', eventName: 'Split', relatedLotId: 'UNLOADED-A', changedQty: '10', dateTime: '2026-09-23 10:00' },
    { step: 'M165', eventName: 'Split', relatedLotId: 'UNLOADED-B', changedQty: '2', dateTime: '2026-09-23 11:00' },
  ];
  const matrix = tracerReportMatrix([summary], ['SMT', 'M033', 'M087', 'M100', 'M111', 'M130', 'M160', 'M164', 'M165']);
  assert.deepEqual(matrix[2].slice(31, 34), ['SPLIT', 'UNLOADED-A', '10']);
  assert.deepEqual(matrix[2].slice(73, 76), ['SPLIT', 'UNLOADED-B', '2']);
  assert.deepEqual(matrix[2].slice(64, 67), ['', '', '']);
  assert.ok(!matrix.slice(2).some(row => row.slice(22, 25).includes('UNLOADED-A')));
  console.log('PASS: M100 and M165 mutation evidence remains in its actual process columns');
}

{
  const root = reportRootFixture('ROOT-A', 'DETAIL-A');
  root.relations = [{ step: 'M100', eventName: 'Split', relatedLotId: 'DETAIL-A', changedQty: '2', dateTime: '2026-09-23 10:00' }];
  const child = reportSummaryFixture('DETAIL-A');
  child.relations = [{ step: 'M100', eventName: 'Split', relatedLotId: 'ROOT-A', changedQty: '2', dateTime: '2026-09-23 10:00' }];
  let matrix = tracerReportMatrix([root, child], ['M100']);
  assert.equal(matrix.slice(2).filter(row => row[7] === 'SPLIT').length, 1);
  root.relations.push({ ...root.relations[0] });
  child.relations.push({ ...child.relations[0] });
  matrix = tracerReportMatrix([root, child], ['M100']);
  assert.equal(matrix.slice(2).filter(row => row[7] === 'SPLIT').length, 2, 'same-history duplicates cannot be collapsed without evidence');
  root.relations = [root.relations[0]];
  child.relations = [{ ...child.relations[0], changedQty: '3' }];
  matrix = tracerReportMatrix([root, child], ['M100']);
  assert.equal(matrix.slice(2).filter(row => row[7] === 'SPLIT').length, 2, 'different transition quantities must remain distinct');
  child.relations = [{ ...child.relations[0], changedQty: '2', dateTime: '2026-09-23 10:01' }];
  matrix = tracerReportMatrix([root, child], ['M100']);
  assert.equal(matrix.slice(2).filter(row => row[7] === 'SPLIT').length, 2, 'different transition times must remain distinct');
  console.log('PASS: only exact reciprocal event pairs are deduplicated; distinct facts remain visible');
}

{
  // A detail LOT splits again and merges its remainder back into the root.
  const root = reportRootFixture('ROOT-A', 'DETAIL-E');
  root.relations = [
    { step: 'M087', eventName: 'Split', relatedLotId: 'DETAIL-E', changedQty: '600', qty: '300', dateTime: '2026-09-24 02:38' },
    { step: 'M100', eventName: 'Merge', relatedLotId: 'DETAIL-E', changedQty: '140', qty: '440', dateTime: '2026-09-24 07:27', mergeDirection: 'incoming' },
    { step: 'M100', eventName: 'Split', relatedLotId: 'UNLOADED-J', changedQty: '230', qty: '210', dateTime: '2026-09-24 07:50' },
  ];
  const detail = { ...reportSummaryFixture('DETAIL-E'), originSplitLotIds: ['ROOT-A'], relations: [
    { step: 'M087', eventName: 'Split', relatedLotId: 'ROOT-A', changedQty: '600', qty: '600', dateTime: '2026-09-24 02:38' },
    { step: 'M100', eventName: 'Split', relatedLotId: 'DETAIL-G', changedQty: '230', qty: '370', dateTime: '2026-09-24 07:23' },
    { step: 'M100', eventName: 'Split', relatedLotId: 'DETAIL-H', changedQty: '230', qty: '140', dateTime: '2026-09-24 07:23' },
    { step: 'M100', eventName: 'Merge', relatedLotId: 'ROOT-A', changedQty: '140', qty: '0', dateTime: '2026-09-24 07:27', mergeDirection: 'outgoing' },
  ] };
  const grandchild = (lotId, splitQty, at) => ({ lotId, partNumber: 'PN-' + lotId, steps: { M165: [reportVisitFixture(lotId)] },
    originSplitLotIds: ['DETAIL-E'], relations: [
      { step: 'M100', eventName: 'Split', relatedLotId: 'DETAIL-E', changedQty: '230', qty: '230', dateTime: '2026-09-24 07:23' },
      { step: 'M165', eventName: 'Split', relatedLotId: 'UNLOADED-' + lotId, changedQty: splitQty, qty: '100', dateTime: at },
    ] });
  const matrix = tracerReportMatrix([root, detail, grandchild('DETAIL-G', '48', '2026-09-25 06:01'),
    grandchild('DETAIL-H', '9', '2026-09-25 02:57')], ['M087', 'M100', 'M165']);
  const events = matrix.slice(2).map(row => [7, 16, 25].map(col => row.slice(col, col + 3).join(' ').trim()));
  assert.deepEqual(events, [
    ['PARENT ROOT-A 5', 'MERGE DETAIL-E +140', ''],
    ['', 'SPLIT UNLOADED-J 230', ''],
    ['SPLIT DETAIL-E 600', 'MERGE ROOT-A -140', ''],
    ['', 'SPLIT DETAIL-G 230', 'SPLIT UNLOADED-DETAIL-G 48'],
    ['', 'SPLIT DETAIL-H 230', 'SPLIT UNLOADED-DETAIL-H 9'],
  ]);
  console.log('PASS: detail split and merge records stay on their own LOT line and name the other LOT');
}

{
  // QTY is the LOT quantity after each event; the next older event is the quantity before.
  const summary = summarizeSeeLotWorkbook(csv('EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n'
    + 'Merge,2026-09-24 22:13,0,M100,,L,U,,OUT-LOT,33,\n'
    + 'Merge,2026-09-24 08:00,33,M100,,L,U,,UNPROVEN-LOT,5,\n'
    + 'Scrap,2026-09-24 07:55,30,M100,E1,L,U,,,1,CODE-A/detail\n'
    + 'Merge,2026-09-24 07:49,31,M100,,L,U,,IN-LOT,4,\n'
    + 'TrackIn,2026-09-24 07:00,27,M100,E1,L,U,,,0,\n'), 'MERGE-DIR.csv');
  assert.deepEqual(summary.relations.map(relation => [relation.relatedLotId, relation.mergeDirection]),
    [['OUT-LOT', 'outgoing'], ['UNPROVEN-LOT', ''], ['IN-LOT', 'incoming']]);
  const matrix = tracerReportMatrix([summary], ['M100']);
  assert.deepEqual(matrix.slice(2).map(row => row.slice(7, 10)),
    [['MERGE', 'IN-LOT', '+4'], ['MERGE', 'UNPROVEN-LOT', '5'], ['MERGE', 'OUT-LOT', '-33']]);
  assert.deepEqual(tracerReportMatrix([reportRootFixture('ROOT-S', 'UNLOADED')], ['M033'])[2].slice(7, 10), ['MERGE', 'ROOT-S', '+100'],
    'verified SMT arrays merge into their parent');
  console.log('PASS: merge QTY is signed only when the LOT quantity proves incoming or outgoing');
}

{
  const summary = reportSummaryFixture('EVENTS');
  summary.steps.M100 = [reportVisitFixture('M100-EQP')];
  summary.relations = [
    ...Array.from({ length: 3 }, (_, index) => ({ step: 'M087', eventName: 'Split', relatedLotId: 'M087-' + index, changedQty: String(index + 1), dateTime: '2026-09-23 10:0' + index })),
    ...Array.from({ length: 2 }, (_, index) => ({ step: 'M100', eventName: 'Merge', relatedLotId: 'M100-' + index, changedQty: String(index + 1), dateTime: '2026-09-23 11:0' + index })),
  ];
  const matrix = tracerReportMatrix([summary], ['M087', 'M100']);
  assert.equal(matrix.length, 5, 'parallel mutation blocks stack the maximum event count');
  assert.equal(matrix.slice(2).filter(row => row[7] === 'SPLIT').length, 3);
  assert.equal(matrix.slice(2).filter(row => row[16] === 'MERGE').length, 2);
  assert.equal(matrix.slice(2).filter(row => row[10] === 'EVENTS').length, 1);
  assert.equal(matrix.slice(2).filter(row => row[19] === 'M100-EQP').length, 1);
  for (const merge of matrix.lotTrackerMerges) for (let row = merge.s.r + 1; row <= merge.e.r; row++) {
    assert.equal(matrix[row][merge.s.c], '', 'body spans must never hide generated values');
  }
  console.log('PASS: mutation events use individual rows and observed process metrics appear once');
}

{
  const root = reportRootFixture('ROOT-A', 'DETAIL-A');
  const smt = quantity => ({ eqp: 'SMT-EQP', in: quantity, out: quantity, failQty: '', failCodes: '' });
  root.smtPmsFlow.totalQuantity = '100';
  root.steps.M010 = [smt('100')]; root.steps.M015 = [smt('100')];
  const child = reportSummaryFixture('DETAIL-A');
  child.steps.M010 = [smt('99')]; child.steps.M015 = [smt('99')];
  let matrix = tracerReportMatrix([root, child], ['SMT', 'M087']);
  assert.ok(matrix.slice(3).some(row => row[8] === '99'), 'different SMT detail quantities must remain visible');
  assert.ok(!matrix.lotTrackerMerges.some(merge => merge.s.c === 8 && merge.s.r === 2 && merge.e.r === matrix.length - 1));
  child.steps.M010 = [smt('100')]; child.steps.M015 = [smt('100')];
  matrix = tracerReportMatrix([root, child], ['SMT', 'M087']);
  assert.ok(matrix.lotTrackerMerges.some(merge => merge.s.c === 8 && merge.s.r === 2 && merge.e.r === matrix.length - 1));
  assert.ok(matrix.slice(3).every(row => row.slice(7, 13).every(value => value === '')));
  console.log('PASS: shared SMT spans require equal quantities; differing detail evidence is preserved');
}

console.log('\nAll RUNID port tests passed.');
