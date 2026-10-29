import assert from 'node:assert/strict';
import { summarizeSeeLotWorkbook, summarizeRunMetadata, assignRunLinks, resolveTrackerSummaries, originLotIds } from './lot-tracker.js';
import { fixedProcessReportMatrix, stepOptions } from './lot-step-report.js';
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
  console.log('PASS: direct RUNID link recognized and partNumber filled');
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
  const matrix = fixedProcessReportMatrix(summaries);
  assert.deepEqual(matrix[2].slice(0, 8), ['PART-2D', 'CHILD-001', 'B', '0', '1', 'SM-2F', '100', '100']);
  assert.equal(matrix[2][17], 'CHILD-001');
  assert.deepEqual(matrix[2].slice(18, 24), ['TH-01', '90', '80', 'CODE-A*10', '10', '88.89%']);
  assert.equal(matrix[3][17], 'SPLIT-001');
  assert.deepEqual(matrix[3].slice(18, 24), ['TH-02', '20', '19', 'CODE-B*1', '1', '95.00%']);
  console.log('PASS: requested fixed process report groups root and split LOT rows with barcode metadata');
}

// --- Case 7: a UUID-named M010 input issue whose complete Split quantities point
// to one 000-position parent is an SMT input RUN ID and needs one PMS lookup.
{
  const smtInputEvents = 'EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\n'
    + 'Terminated,2026-09-21 10:03,0,M010,,L,U,,,0,\n'
    + 'Split,2026-09-21 10:02,0,M010,,L,U,,HABC020639,3,\n'
    + 'Split,2026-09-21 10:01,3,M010,,L,U,,HABC010639,3,\n'
    + 'ISSUE_VMS1_VMDL,2026-09-21 10:00,6,M010,,L,U,,,0,\n';
  const summary = summarizeSeeLotWorkbook(csv(smtInputEvents), '11111111-2222-4333-8444-555555555555.csv');
  assert.equal(summary.lotId, 'HABC000639');
  assert.equal(summary.lotIdSource, 'M010 SMT input');
  assert.equal(summary.sourceKind, 'SMT input RUN ID');
  assert.equal(summary.smtInputRun, true);
  assert.equal(summary.pmsRequired, true);
  assert.equal(summary.smtInputQuantity, '6');
  assert.equal(summary.smtSplitCount, '2');
  assert.equal(summary.initialQty, '6');
  assert.deepEqual(stepOptions([summary]), ['SMT']);
  const tracking = trackingLists([summary]);
  assert.deepEqual(tracking.missing.map(row => [row.id, row.types]), [['HABC000639', 'PMS 정보']]);
  assert.match(tracking.missing[0].action, /PMS에서 RUN ID/);
  assert.ok(tracking.matrices['SMT RUNID 추적'].some(row => row[0] === 'HABC000639' && /PMS 정보 요청/.test(row[5])));
  assert.deepEqual(tracking.matrices['SPLIT LOT 목록'].slice(1).map(row => row[1]).sort(), ['HABC010639', 'HABC020639']);

  const incomplete = summarizeSeeLotWorkbook(csv(smtInputEvents.replace('HABC020639,3', 'HABC020639,2')), '11111111-2222-4333-8444-555555555555.csv');
  assert.equal(incomplete.smtInputRun, false);
  assert.notEqual(incomplete.lotId, 'HABC000639');
  const unrelatedName = summarizeSeeLotWorkbook(csv(smtInputEvents), 'OTHER-LOT.csv');
  assert.equal(unrelatedName.smtInputRun, false);
  console.log('PASS: evidence-complete M010 issue derives one SMT input RUN ID and requests PMS once');
}

console.log('\nAll RUNID port tests passed.');
