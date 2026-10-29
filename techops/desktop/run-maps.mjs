export function connectRunMaps(summaries, maps) {
  const links = [];
  const warnings = [];
  const used = new Set();
  for (const summary of summaries) {
    const origin = summary.originSplitLotIds || [];
    const matches = [];
    for (const map of maps) {
      const direct = map.mapRecords.filter(r => origin.includes(map.lotId) && (r.mergeLot === summary.lotId || r.splitLot === summary.lotId));
      const indirect = direct.length ? [] : map.mapRecords.filter(r => origin.includes(r.mergeLot));
      const rows = direct.length ? direct : indirect;
      if (!rows.length) continue;
      const products = [...new Set(rows.map(r => r.productId).filter(Boolean))];
      matches.push({ map, rows, products, type: direct.length ? '원본 양방향 연결' : '원본 경유 연결' });
    }
    const allProducts = [...new Set(matches.flatMap(m => m.products))];
    summary.runMapLinks = matches.map(m => ({ runId: m.map.lotId, type: m.type, via: [...new Set(m.rows.map(r => r.mergeLot))].join(', '), filename: m.map.filename }));
    if (allProducts.length === 1) summary.partNumber = allProducts[0];
    if (allProducts.length > 1) warnings.push([summary.lotId, '연결 맵의 PROD_ID가 서로 달라 PART NO를 채우지 않았습니다.']);
    for (const m of matches) {
      used.add(m.map);
      links.push([summary.lotId, m.map.lotId, m.type, [...new Set(m.rows.map(r => r.mergeLot))].join(', '), m.rows.length, allProducts.length === 1 ? allProducts[0] : '', m.map.filename]);
    }
  }
  for (const map of maps) if (!used.has(map)) warnings.push([map.lotId, '맵은 포함됐지만 선택한 See LOT의 시작 Split과 연결되지 않았습니다.']);
  const mapList = maps.map(map => [map.lotId, map.filename, map.mapRecords.length, new Set(map.mapRecords.map(r => r.splitLot)).size, new Set(map.mapRecords.map(r => r.mergeLot)).size, used.has(map) ? '이벤트 LOT 연결됨' : '연결 확인 필요']);
  return { matrices: {
    'RUNID 연결': [['이벤트 LOT', 'RUNID', '연결 근거', 'MERGE LOT / 경유 LOT', '맵 행 수', 'PART NO', '원본 파일'], ...links],
    'RUNID 맵 목록': [['RUNID', '원본 파일', '행 수', 'SPLIT LOT 수', 'MERGE LOT 수', '연결 상태'], ...mapList],
    'RUNID 확인 사항': [['LOT / RUNID', '확인 사항'], ...warnings],
  }, linkedLots: summaries.filter(s => s.runMapLinks.length).length };
}
