import assert from 'node:assert/strict';
for (const base of ['./engine','./offline-web/engine']) {
  const {resolveTrackerSummaries,summarizeSeeLotWorkbook}=await import(base+'/lot-tracker.js');
  const {splitFlowRows}=await import(base+'/lot-step-report.js');
  const opaque='11111111-2222-3333-4444-555555555555';
  for(const ids of [
    ['H1AB000639','H2AB000639','H3AB000639'],
    ['HABC000139','HABC000239','HABC000339'],
    ['HABC000631','HABC000632','HABC000633'],
    ['HABC001639','HABC002639','HABC003639'],
    ['XABC001639','XABC009639','XABCZZZ639'],
  ]) {
    const s={lotId:opaque,currentQty:'0',status:'Terminated',relations:ids.map((relatedLotId,i)=>({eventName:'Split',relatedLotId,qty:String(20-i*10),changedQty:'10'}))};
    resolveTrackerSummaries([s]); assert.equal(s.lotId,opaque,'Never fabricate parent from identifier sequence');
  }
  const relation=(eventName,relatedLotId,qty,changedQty,dateTime='2026-09-24 10:00')=>({eventName,relatedLotId,qty,changedQty,dateTime,step:'M165'});
  const parent={lotId:'HABC000639',currentQty:'50',initialQty:'100',relations:[relation('Split','HABC001639','70','30'),relation('Split','HABC009639','50','20')]};
  const child={lotId:'HABC001639',currentQty:'0',status:'Terminated',relations:[relation('Merge','XDEF001639','0','30')]};
  const target={lotId:'XDEF001639',currentQty:'80',status:'TrackOut',relations:[]};
  let rows=splitFlowRows([parent,child,target]);
  assert.ok(rows.some(r=>r.type==='Split'&&r.lotId===child.lotId),'Retain split before merge');
  let merge=rows.find(r=>r.type==='Merge');
  assert.equal(merge.lotId,child.lotId);assert.equal(merge.parentTarget,target.lotId);assert.equal(merge.quantity,'30');assert.equal(merge.currentQty,'0');
  rows=splitFlowRows([{lotId:'SOURCE',currentQty:'60',originSplitLotIds:['PARENT'],relations:[relation('Split','PARENT','100','100','2026-09-24 09:00'),relation('Merge','TARGET','60','40')]}]);
  merge=rows.find(r=>r.type==='Merge');assert.equal(merge.parentTarget,'TARGET');assert.equal(merge.currentQty,'60');assert.ok(!merge.status.includes('Terminated'));
  const incoming={lotId:'OTHER',currentQty:'0',relations:[relation('Merge',child.lotId,'0','10')]};
  assert.ok(splitFlowRows([parent,child,incoming]).some(r=>r.type==='Split'&&r.lotId===child.lotId),'Incoming merge must not erase existing split');
  const csv='EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\nTerminated,2026-09-24 11:00,0,M165,,,,,,0,\nMerge,2026-09-24 10:00,0,M165,,,,,XDEF001639,30,\n';
  const parsed=summarizeSeeLotWorkbook(new TextEncoder().encode(csv),'HABC001639.csv');assert.equal(parsed.status,'Terminated');assert.equal(parsed.currentQty,'0');assert.equal(parsed.relations[0].relatedLotId,'XDEF001639');
  const linked={lotId:opaque,relations:[relation('Split',parent.lotId,'30','30')]};
  resolveTrackerSummaries([structuredClone(parent),linked]);assert.equal(linked.lotId,child.lotId,'Matching explicit split evidence still resolves identity');
  const reciprocalParent={lotId:opaque,currentQty:'0',status:'Terminated',relations:[relation('Split','HXYZ001639','90','10','2026-09-24 08:00'),relation('Split','HXYZ002639','80','10','2026-09-24 08:01')]};
  const receivingChild={lotId:'HXYZ001639',currentQty:'15',originSplitLotIds:['HXYZ000639'],relations:[
    relation('Split','HXYZ000639','10','10','2026-09-24 08:00'),
    relation('Merge','HXYZ002639','20','10','2026-09-24 08:02'),
    relation('Split','HXYZ003639','15','5','2026-09-24 08:03'),
  ]};
  resolveTrackerSummaries([reciprocalParent,receivingChild]);
  assert.equal(reciprocalParent.lotId,'HXYZ000639','Resolve opaque parent only from reciprocal Split evidence');
  rows=splitFlowRows([reciprocalParent,receivingChild]);
  assert.ok(!rows.some(r=>r.type==='Split'&&r.lotId==='HXYZ000639'),'Do not show the incoming origin as a child split');
  merge=rows.find(r=>r.type==='Merge');
  assert.equal(merge.lotId,'HXYZ002639');assert.equal(merge.parentTarget,'HXYZ001639');assert.equal(merge.status,'Merged into HXYZ001639');
  assert.ok(rows.some(r=>r.type==='Split'&&r.lotId==='HXYZ003639'),'Keep a later outgoing split');
  rows=splitFlowRows([{lotId:'AMBIGUOUS',relations:[relation('Merge','OTHER','50','10')]}]);
  assert.ok(rows.some(r=>String(r.status).includes('unconfirmed')),'Do not invent an ambiguous merge direction');
  console.log('PASS '+base+': explicit reciprocal parent, incoming/outgoing/unknown merge, origin split excluded, prior LOT rules retained');
}
