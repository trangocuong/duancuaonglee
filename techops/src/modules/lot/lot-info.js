import { LOT_DICTIONARY } from "../../i18n/lot.js";

export const RETIRED_DAILY_FIELDS = new Set(['LOT Status', '랏넘버', '작업내용', '진행중인 공정', '수량', '양품 수량', '불량 수량', '수율', '진행률', '상태', '이슈/조치내용', '이슈·조치내용', '다음 계획', '비고']);

export const lotWords = LOT_DICTIONARY.lotWords;

export function normalizeLotIds(value) {
  const ids = String(value).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (ids.length > 50 || ids.some(id => id.length > 120 || /[\u0000-\u001f\u007f]/.test(id))) throw Error('LOTID');
  return [...new Set(ids)].join('\n');
}

export function lotInput(field, value, lang, esc) {
  const w = lotWords[lang];
  return `<textarea name="field_${field.id}" data-lot-id maxlength="6100" aria-label="LOTID" title="${esc(w.hint)}" placeholder="${esc(w.entry)}">${esc(value)}</textarea><button type="button" class="secondary small" data-lot-lookup>${esc(w.lookup)}</button><div data-lot-result aria-live="polite"></div>`;
}

export function lotScript(lang) {
  return `<script>(function(){var w=${JSON.stringify(lotWords[lang])};document.querySelectorAll('[data-lot-lookup]').forEach(function(button){var parent=button.parentElement,input=parent.querySelector('[data-lot-id]'),out=parent.querySelector('[data-lot-result]');input.addEventListener('input',function(){out.textContent='';});button.addEventListener('click',async function(){var submitted=input.value;button.disabled=true;out.textContent='';try{var response=await fetch('/api/lot-info?ids='+encodeURIComponent(submitted));if(!response.ok)throw Error();var data=await response.json();if(input.value!==submitted)return;data.records.forEach(function(record){var row=document.createElement('div');var label=document.createElement('strong');label.textContent=record.lotId;row.append(label);var detail=document.createElement('div');detail.className='muted';detail.textContent=record.info?Object.entries(record.info).filter(function(pair){return pair[0]!=='LOTID'&&pair[1];}).map(function(pair){return pair[0]+': '+pair[1];}).join(' · '):w.missing;row.append(detail);out.append(row);});}catch(e){out.textContent=w.error;}finally{button.disabled=false;}});});})();</script>`;
}

export async function handleLotInfoApi(request, env, lang) {
  const url = new URL(request.url), w = lotWords[lang];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  let ids;
  try { ids = normalizeLotIds(url.searchParams.get('ids') || '').split('\n').filter(Boolean); } catch { return json({ error: w.invalidLot }, 400); }
  const records = ids.length ? (await env.DB.prepare(`SELECT lot_id,data_json FROM tech_lot_info WHERE lot_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results : [];
  const byId = new Map(records.map(row => [row.lot_id, JSON.parse(row.data_json)]));
  return json({ tracker: 'pending', records: ids.map(lotId => ({ lotId, info: byId.get(lotId) || null })) });
}
