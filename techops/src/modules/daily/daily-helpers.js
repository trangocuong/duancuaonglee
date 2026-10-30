import {
  escapeHtml, json,
} from "../../utils/helpers.js";
import {
  DEFAULT_LANG, STANDARD_OPTION_LABELS, DAILY_STATUS_LABELS,
} from "../../i18n/index.js";
import {
  normalizeDailyStatusCode, buildDisplayTranslationMap, translatedText, mapWithConcurrency,
} from "../translation/translation-service.js";
import {
  DAILY_CLASSIFICATION_FIELDS, DAILY_CLASSIFICATION_ROWS,
} from "../../config/daily-config.js";
import { lotInput } from "../lot/lot-info.js";
import {
  loadDailyFields, resolveFieldLabel, resolveValueText, resolveOptionValue, isIdentifierField,
} from "../../routes/daily-fields.js";



export function getUpdateFieldMap(update) {
  return Object.fromEntries((update.fieldValues || []).map((field) => [field.key || field.label, field.value]));
}

export function getUpdateRawFieldMap(update) {
  return Object.fromEntries((update.fieldValues || []).map((field) => [field.key || field.label, field.rawValue ?? field.value]));
}

export function firstDailyValue(map, ...keys) {
  for (const key of keys) {
    if (map[key] !== undefined && map[key] !== null && String(map[key]).trim() !== "") return map[key];
  }
  return "";
}

export function dailyGoodDefectValues(fields) {
  let good = firstDailyValue(fields, "양품 수량", "양품");
  let defect = firstDailyValue(fields, "불량 수량", "불량");
  const combined = firstDailyValue(fields, "양품/불량 수량", "양품·불량 수량");
  if ((!good || !defect) && combined) {
    const parts = String(combined).split(/\s*[\/|:]\s*/, 2);
    if (!good && parts[0]) good = parts[0];
    if (!defect && parts[1]) defect = parts[1];
  }
  return { good, defect };
}

export function isIssueStatus(status) {
  return ["DELAYED", "RESTRICTED", "ISSUE", "REWORK", "ON_HOLD"].includes(normalizeDailyStatusCode(status));
}

export function isDoneStatus(status) {
  return normalizeDailyStatusCode(status) === "COMPLETED";
}

export function dailyAttentionItems(updates) {
  const actions = [];

  for (const update of updates) {
    const fields = getUpdateFieldMap(update);
    const rawFields = getUpdateRawFieldMap(update);
    const rawStatus = firstDailyValue(rawFields, "상태") || update.rawStatusValue || "";
    const status = firstDailyValue(fields, "상태") || update.statusValue || rawStatus;
    const category = update.category || firstDailyValue(rawFields, "업무구분") || "";
    const explicitIssueAction = firstDailyValue(fields, "이슈/조치내용", "이슈 및 조치내용");
    const issueAction = explicitIssueAction || (/이슈대응|불량분석/.test(category) ? firstDailyValue(fields, "비고") : "");
    if (isIssueStatus(rawStatus) || issueAction) {
      actions.push({ ...update, status, rawStatus, issueAction, fields });
    }
  }
  return actions;
}

// ---------- 유틸 ----------

// #endregion



// updates: tech_daily_update 행 배열(각 .id 필요). 각 행에 .fieldValues(뷰어 언어로 이미
// 번역된 {label,value} 목록)와, 라벨이 정확히 '상태'인 필드가 있으면 그 값을 담은
// .statusValue를 붙여서 돌려준다(요약 테이블 등에서 상태만 뽑아 쓰기 위함).
export async function attachFieldValues(env, lang, updates) {
  if (!updates.length) return updates;
  const { fields } = await loadDailyFields(env, true);
  const fieldById = Object.fromEntries(fields.map((f) => [f.id, f]));
  const statusField = fields.find((f) => f.label === "상태");
  const values = await env.DB.prepare(
    `SELECT * FROM tech_daily_update_value WHERE update_id IN (${updates.map(() => "?").join(",")})`
  ).bind(...updates.map((u) => u.id)).all();
  const valuesByUpdate = {};
  for (const v of values.results) {
    (valuesByUpdate[v.update_id] ||= {})[v.field_id] = v;
  }
  const fieldLabelTranslations = await buildDisplayTranslationMap(
    env,
    fields.filter((field) => !((lang === "en" && field.label_en) || (lang === "vi" && field.label_vi))).map((field) => field.label),
    lang
  );
  const missingValues = values.results.filter((row) => {
    const field = fieldById[row.field_id];
    if (isIdentifierField(field)) return false;
    return field?.input_type === "select"
      || (lang === "en" && !row.value_en)
      || (lang === "vi" && !row.value_vi);
  }).map((row) => row.value);
  const valueTranslations = await buildDisplayTranslationMap(env, missingValues, lang);
  const displayValue = (row) => {
    const field = fieldById[row.field_id];
    if (isIdentifierField(field)) return row.value;
    return field?.input_type === "select"
      ? resolveOptionValue(row.value, lang, valueTranslations, field?.label === "상태")
      : resolveValueText(row, lang, valueTranslations);
  };
  return updates.map((u) => {
    const raw = valuesByUpdate[u.id] || {};
    return {
      ...u,
      rawStatusValue: statusField && raw[statusField.id] ? raw[statusField.id].value : null,
      statusValue: statusField && raw[statusField.id] ? displayValue(raw[statusField.id]) : null,
      fieldValues: Object.entries(raw)
        .map(([fieldId, row]) => ({
          fieldId,
          key: fieldById[fieldId] ? fieldById[fieldId].label : "-",
          label: fieldById[fieldId] ? resolveFieldLabel(fieldById[fieldId], lang, fieldLabelTranslations) : "-",
          rawValue: row.value,
          value: displayValue(row),
        }))
        .filter((fv) => fv.value),
    };
  });
}


// 필드가 depends_on_field_id 를 가지면(=캐스케이딩 드롭다운) 각 <option> 에 상위 선택지의
// 실제 값을 data-parent 로 심어두고, <select> 자체에는 어느 상위 필드를 지켜봐야 하는지
// data-depends-on 으로 표시해둔다. 실제 필터링은 pageDailyItemDetail 에 심어둔 공용 스크립트가 처리.
export function renderFieldInput(field, L, value = "", optionValueById = {}, lang = DEFAULT_LANG, translationMap = new Map()) {
  const name = `field_${field.id}`;
  if (field.label === "LOTID") return lotInput(field, value, lang, escapeHtml);
  if (field.input_type === "textarea") {
    if (field.label === "파트넘버") {
      return `<textarea name="${name}" data-product-info aria-describedby="product-match-${field.id}" placeholder="Part number를 한 줄에 하나씩 입력">${escapeHtml(value)}</textarea>
        <div id="product-match-${field.id}" class="muted" data-product-match aria-live="polite"></div>`;
    }
    return `<textarea name="${name}">${escapeHtml(value)}</textarea>`;
  }
  if (field.input_type === "select") {
    const classificationLevel = DAILY_CLASSIFICATION_FIELDS.indexOf(field.label);
    // Standard classifications use the complete workbook path, not the generic
    // parent-value filter. CSV imports may contain the same value on many paths.
    const dependsAttr = classificationLevel < 0 && field.depends_on_field_id ? ` data-depends-on="field_${field.depends_on_field_id}"` : "";
    const classificationAttr = classificationLevel >= 0
      ? ` data-classification-level="${classificationLevel}"${classificationLevel < 4 ? " required" : ""}`
      : "";
    const choices = classificationLevel >= 0 ? [...new Map(field.options.map((option) => [option.value, option])).values()] : field.options;
    const opts = choices.map((o) => {
      const parentAttr = classificationLevel < 0 && o.parent_option_id ? ` data-parent="${escapeHtml(optionValueById[o.parent_option_id] || "")}"` : "";
      return `<option value="${escapeHtml(o.value)}"${parentAttr} ${o.value === value ? "selected" : ""}>${escapeHtml(resolveOptionValue(o.value, lang, translationMap, field.label === "상태"))}</option>`;
    }).join("");
    return `<select name="${name}"${dependsAttr}${classificationAttr}><option value=""></option>${opts}</select>`;
  }
  return `<input name="${name}" value="${escapeHtml(value)}">`;
}

// 부모 <select> 값이 바뀔 때마다 data-depends-on 으로 그 부모를 지목한 자식 <select> 의
// 선택지 중 data-parent 가 일치하지 않는 것만 숨긴다. 부모를 아직 안 골랐으면 전부 숨김
// (선택지가 관리자 설정에 없는 독립 필드는 data-depends-on 자체가 없어 영향 없음).
export const CASCADING_SELECT_SCRIPT = `<script>
(function(){
  document.querySelectorAll('select[data-depends-on]').forEach(function(sel){
    var parent = document.querySelector('[name="' + sel.getAttribute('data-depends-on') + '"]');
    if (!parent) return;
    function sync(){
      var pv = parent.value;
      Array.prototype.forEach.call(sel.querySelectorAll('option[data-parent]'), function(o){
        o.hidden = (pv === '' || o.getAttribute('data-parent') !== pv);
      });
      if (sel.selectedOptions[0] && sel.selectedOptions[0].hidden) sel.value = '';
      sel.dispatchEvent(new Event('change'));
    }
    parent.addEventListener('change', sync);
    sync();
  });
})();
</script>`;

export function dailyClassificationScript() {
  return `<script>
(function(){
  var rows=${JSON.stringify(DAILY_CLASSIFICATION_ROWS)};
  var selects=Array.prototype.slice.call(document.querySelectorAll('select[data-classification-level]'))
    .sort(function(a,b){ return Number(a.dataset.classificationLevel)-Number(b.dataset.classificationLevel); });
  function syncFrom(level){
    for(var i=level+1;i<selects.length;i++){
      var prefixComplete=selects.slice(0,i).every(function(select){ return !!select.value; });
      var allowed=new Set(rows.filter(function(row){
        for(var j=0;j<i;j++){ if(selects[j].value && row[j]!==selects[j].value) return false; }
        return true;
      }).map(function(row){ return row[i] || ''; }));
      Array.prototype.forEach.call(selects[i].options,function(option){
        if(!option.value) return;
        option.hidden=!prefixComplete || !allowed.has(option.value);
        option.disabled=option.hidden;
      });
      if(selects[i].selectedOptions[0] && selects[i].selectedOptions[0].hidden) selects[i].value='';
      if(i===4) selects[i].required=prefixComplete && !allowed.has('');
    }
  }
  selects.forEach(function(select,index){ select.addEventListener('change',function(){ syncFrom(index); }); });
  syncFrom(-1);

  var product=document.querySelector('[data-product-info]');
  var output=document.querySelector('[data-product-match]');
  if(!product || !output) return;
  var timer;
  function checkProducts(){
    var values=product.value.split(/\\r?\\n/).map(function(v){return v.trim();}).filter(Boolean).slice(0,20);
    if(!values.length){ output.textContent=''; return; }
    output.textContent='제품정보 확인 중...';
    Promise.all(values.map(function(value){
      return fetch('/api/product-match?q='+encodeURIComponent(value)).then(function(r){return r.json();})
        .then(function(result){ return value+' : '+(result.matches[0]?.display || '일치 제품 없음'); })
        .catch(function(){ return value+' : 조회 실패'; });
    })).then(function(lines){ output.textContent=lines.join(' / '); });
  }
  product.addEventListener('input',function(){ clearTimeout(timer); timer=setTimeout(checkProducts,300); });
  checkProducts();
})();
</script>`;
}

export async function matchProductRows(env, rawQuery) {
  const query = String(rawQuery || "").trim().slice(0, 80);
  if (!query) return null;
  const isSsd = /^MZ/i.test(query);
  const setCode = isSsd ? "SSD_PRODUCT" : "DM_PRODUCT";
  const keyPath = isSsd ? "$.SSD_PN" : "$.BASE_PN";
  // Module(DM) 파트넘버는 세대별로 기준 P/N 길이가 다르다 — 표준 세대(D1a/D1b/D1y 등)는 16자리,
  // D1bp/D1c는 파트넘버 체계 변경으로 12자리다(2026-09-16, 운영 마스터 데이터로 확인). 앞자리를
  // 16자리로 먼저 찾고 없으면 12자리로 재시도해서 두 체계를 모두 지원한다. SSD는 이 문제가 없어
  // 입력값 전체를 그대로 사용한다.
  const candidates = isSsd ? [query] : [...new Set([query.slice(0, 16), query.slice(0, 12)])].filter(Boolean);
  for (const candidate of candidates) {
    const result = await env.DB.prepare(
      `SELECT r.row_key, r.data_json
         FROM tech_master_row r
         JOIN tech_master_set s ON s.id=r.set_id
        WHERE s.code=? AND r.active=1
          AND (upper(r.row_key)=upper(?) OR upper(COALESCE(json_extract(r.data_json, ?),''))=upper(?)
               OR instr(upper(COALESCE(json_extract(r.data_json, ?),'')),upper(?))>0)
        ORDER BY CASE WHEN upper(COALESCE(json_extract(r.data_json, ?),''))=upper(?) THEN 0 ELSE 1 END, r.row_key
        LIMIT 5`
    ).bind(setCode, candidate, keyPath, candidate, keyPath, candidate, keyPath, candidate).all();
    if (result.results.length) return { setCode, rows: result.results.map((row) => buildProductMatchDisplay(row, isSsd)) };
  }
  return { setCode, rows: [] };
}

// SSD는 기존 표시 방식(부품번호 · 모델명 · Density)을 유지한다. Module(DM)은 요약을
// "Gen. IC버전 Density Speed 폼팩터" 순으로 압축한다(예: "D1bp VC 32GB 6400 RDIMM") —
// 폼팩터는 MDL_INFO("D5 RDIMM" 등)의 마지막 단어만 취해 DDR 세대 접두어(D5 등)는 뺀다.
export function buildProductMatchDisplay(row, isSsd) {
  let data = {};
  try { data = JSON.parse(row.data_json || "{}"); } catch (_) {}
  if (isSsd) {
    const partNumber = data.SSD_PN || row.row_key;
    const details = [data.MODEL_NAME, data.DENSITY].filter(Boolean);
    return { partNumber, display: [partNumber, ...details].join(" · ") };
  }
  const partNumber = data.BASE_PN || row.row_key;
  const formFactor = String(data.MDL_INFO || "").trim().split(/\s+/).pop() || "";
  const details = [data.GEN, data.IC_VER, data.DENSITY, data.SPEED, formFactor].filter(Boolean);
  return { partNumber, display: details.join(" ") };
}

export async function apiProductMatch(request, env) {
  const query = String(new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  const result = await matchProductRows(env, query);
  return json({ source: result?.setCode || null, matches: result?.rows || [] });
}

// 새 항목 등록 제목의 마지막 [ ] 조각을 만든다. 입력된 파트넘버를 줄 단위로 각각 매칭해
// 압축 표시를 구하고, 같은 결과가 반복되면 하나로 합친다(여러 줄이 보통 같은 기준정보를
// 가리키므로). 일치하는 마스터 행이 하나도 없으면 정보 유실을 막기 위해 입력한 파트넘버
// 원문 첫 줄을 그대로 쓴다.
export async function describePartNumberMatches(env, rawValue) {
  const lines = String(rawValue || "").split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  if (!lines.length) return "";
  const results = await mapWithConcurrency(lines, 6, (line) => matchProductRows(env, line));
  const displays = results.map((result) => result?.rows[0]?.display).filter(Boolean);
  return displays.length ? [...new Set(displays)].join("/") : lines[0];
}

// #endregion
