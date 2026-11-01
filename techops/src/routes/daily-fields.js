import {
  json, html, plainText, redirect,
  escapeHtml,
} from "../utils/helpers.js";
import {
  layout, dailyWorkSubtabs, forbiddenResponse,
} from "../views/layout.js";
import {
  FIELD_HEADERS, fieldCsv, parseFieldCsv,
} from "../modules/daily/daily-field-csv.js";
import {
  DAILY_CLASSIFICATION_FIELDS,
  DAILY_CLASSIFICATION_ROWS,
  classificationOptions,
} from "../config/daily-config.js";
import {
  DEFAULT_LANG,
  STANDARD_OPTION_LABELS,
  DAILY_STATUS_LABELS,
  getLang,
  t,
} from "../i18n/index.js";
import {
  normalizeDailyStatusCode,
  resolveTrilingualText,
  buildDisplayTranslationMap,
  warmTranslationCache,
  translatedText,
} from "../modules/translation/translation-service.js";
import { RETIRED_DAILY_FIELDS, lotWords } from "../modules/lot/lot-info.js";

export const DAILY_CLASSIFICATION_VALUES = new Set(DAILY_CLASSIFICATION_ROWS.flat().filter(Boolean));


export function resolveFieldLabel(field, lang, translationMap = new Map()) {
  if (lang === "en" && field.label_en) return field.label_en;
  if (lang === "vi" && field.label_vi) return field.label_vi;
  return translatedText(field.label, translationMap) || field.label;
}

// tech_daily_update_value 한 행(value/value_en/value_vi)을 뷰어의 화면 언어에 맞는
// 텍스트로 바꾼다 — resolveFieldLabel과 완전히 같은 패턴(번역이 없으면 원문 폴백).
export function resolveValueText(row, lang, translationMap = new Map()) {
  if (lang === "en" && row.value_en) return row.value_en;
  if (lang === "vi" && row.value_vi) return row.value_vi;
  return translatedText(row.value, translationMap) || row.value;
}

export const IDENTIFIER_DAILY_FIELDS = new Set(["LOTID", "랏넘버", "파트넘버"]);
export const isIdentifierField = (field) => IDENTIFIER_DAILY_FIELDS.has(field?.label);

export function resolveOptionValue(value, lang, translationMap = new Map(), isStatus = false) {
  const code = isStatus ? normalizeDailyStatusCode(value) : null;
  if (!isStatus && lang === "ko" && DAILY_CLASSIFICATION_VALUES.has(value)) return value;
  const standard = code
    ? (DAILY_STATUS_LABELS[code]?.[lang] || DAILY_STATUS_LABELS[code]?.ko || value)
    : (STANDARD_OPTION_LABELS[value]?.[lang] || value);
  return standard !== value ? standard : (translatedText(value, translationMap) || value);
}

// updates: tech_daily_update 행 배열(각 .id 필요). 각 행에 .fieldValues(뷰어 언어로 이미

export async function loadDailyFields(env, includeRetired = false) {
  const fields = await env.DB.prepare(`SELECT * FROM tech_daily_field ORDER BY sort_order, id`).all();
  const options = await env.DB.prepare(`SELECT * FROM tech_daily_field_option ORDER BY field_id, sort_order, id`).all();
  const optionsByField = {};
  const optionValueById = {};
  for (const o of options.results) {
    (optionsByField[o.field_id] ||= []).push(o);
    optionValueById[o.id] = o.value;
  }
  return { fields: (includeRetired ? fields.results : activeDailyFields(fields.results)).map((f) => ({ ...f, options: optionsByField[f.id] || [] })), optionValueById };
}

export function activeDailyFields(fields) {
  return hasDailyClassification(fields) ? fields.filter(f => !RETIRED_DAILY_FIELDS.has(f.label)) : fields;
}

export function hasDailyClassification(fields) {
  return DAILY_CLASSIFICATION_FIELDS.every((label) => fields.some((field) => field.label === label));
}

export const DAILY_REPORT_FIELD_TEMPLATE = [
  ["소속부서", "Department", "Bộ phận", "select", 10],
  ["업무구분", "Work Category", "Phân loại công việc", "select", 20],
  ["업무유형", "Work Type", "Loại công việc", "select", 30],
  ["중분류", "Subcategory", "Phân loại phụ", "select", 40],
  ["소분류", "Detail Category", "Phân loại chi tiết", "select", 50],
  ["추가입력", "Additional Input", "Thông tin bổ sung", "text", 60],
  ["파트넘버", "Part Number", "Mã linh kiện", "textarea", 70],
  ["LOTID", "LOTID", "LOTID", "textarea", 80],
];

export async function applyDailyReportFieldTemplate(env) {
  const statements = [
    env.DB.prepare("DELETE FROM tech_daily_update"),
    env.DB.prepare("DELETE FROM tech_daily_report"),
    env.DB.prepare("DELETE FROM tech_daily_field"),
  ];
  for (const [label, en, vi, inputType, order] of DAILY_REPORT_FIELD_TEMPLATE) {
    statements.push(env.DB.prepare(
      "INSERT INTO tech_daily_field(label,label_en,label_vi,input_type,sort_order) VALUES (?,?,?,?,?)"
    ).bind(label, en, vi, inputType, order));
  }
  DAILY_CLASSIFICATION_FIELDS.forEach((label, level) => {
    classificationOptions(level).forEach((value, index) => statements.push(env.DB.prepare(
      "INSERT INTO tech_daily_field_option(field_id,value,sort_order) SELECT id,?,? FROM tech_daily_field WHERE label=?"
    ).bind(value, (index + 1) * 10, label)));
  });
  await env.DB.batch(statements);
}

export async function handleDailyFieldTemplateApply(request, env, user) {
  if (user.role !== "admin") return forbiddenResponse(user, getLang(request), t(getLang(request)));
  await applyDailyReportFieldTemplate(env);
  return redirect("/daily-fields?standardApplied=1");
}

export async function fieldTransfer(request, env, user, exporting) {
  const lang = getLang(request), L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);
  const words = L.fieldTransferWords;
  const fields = (await loadDailyFields(env)).fields;
  const options = (await env.DB.prepare("SELECT * FROM tech_daily_field_option ORDER BY sort_order,id").all()).results;
  const byId = new Map(fields.map(f => [f.id, f]));
  if (exporting) {
    const rows = new URL(request.url).searchParams.get("template") === "1" ? [] : fields.flatMap(f => {
      const metadata = [f.label, f.label_en, f.label_vi, f.input_type, f.sort_order, byId.get(f.depends_on_field_id)?.label || ""];
      const choices = options.filter(o => o.field_id === f.id);
      return choices.length ? choices.map(o => [...metadata, o.value, o.sort_order, options.find(p => p.id === o.parent_option_id)?.value || ""]) : [[...metadata, "", "", ""]];
    });
    return new Response(fieldCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="daily-field-settings.csv"', "cache-control": "no-store" } });
  }
  let notice = "", source = "", preview = [], valid = false;
  if (request.method === "POST") {
    try {
      const reader = request.body.getReader(), chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw Error("1MB"); } chunks.push(value); }
      const form = await new Response(new Blob(chunks), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
      const confirm = form.get("confirm") === "1";
      if (confirm) source = String(form.get("csv") || "");
      else {
        const file = form.get("file");
        if (!file || typeof file.arrayBuffer !== "function" || !file.name.toLowerCase().endsWith(".csv") || file.size > 1024 * 1024) throw Error("CSV UTF-8 / 1MB");
        source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      }
      const rows = parseFieldCsv(source);
      if (!rows.length) throw Error("0 rows");
      const existing = new Map();
      for (const f of fields) { if (existing.has(f.label)) throw Error(`Duplicate field name: ${f.label}`); existing.set(f.label, f); }
      const incoming = new Map(), choices = [];
      rows.forEach((r, index) => {
        const [name, en, vi, type, order, parent, value, optionOrder, parentValue] = r;
        const fail = reason => { throw Error(`${index + 2}: ${reason}`); };
        if (r.length !== FIELD_HEADERS.length || !name || name.length > 200 || r.some(v => v.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) || !["text", "textarea", "select"].includes(type) || !/^\d{1,6}$/.test(order)) fail("항목명 / text, textarea, select / 순서 0–999999");
        if (hasDailyClassification(fields) && RETIRED_DAILY_FIELDS.has(name)) fail(lotWords[lang].retired);
        if (name === "LOTID" && (type !== "textarea" || parent)) fail("LOTID / textarea / no parent");
        const metadata = { label: name, label_en: en, label_vi: vi, input_type: type, sort_order: Number(order), parent };
        if (incoming.has(name) && JSON.stringify(incoming.get(name)) !== JSON.stringify(metadata)) fail(`Conflicting metadata: ${name}`);
        const old = existing.get(name);
        if (old && old.input_type !== type) fail(`Existing type: ${name}`);
        if (type !== "select" && (parent || value || parentValue)) fail("select required");
        incoming.set(name, metadata);
        if (value) {
          if (!/^\d{1,6}$/.test(optionOrder)) fail("선택순서 0–999999");
          if (!!parent !== !!parentValue) fail("상위선택값 / parent option");
          if (name === "상태" && !options.some(o => o.field_id === old?.id && o.value === value)) fail("Managed status options");
          const choice = { name, value, order: Number(optionOrder), parentValue };
          if (choices.some(c => c.name === name && c.value === value && c.parentValue === parentValue)) fail(`Duplicate option: ${value}`);
          choices.push(choice);
        } else if (optionOrder || parentValue) fail("선택값 / option value");
        preview.push({ r, status: old ? words[8] : words[7] });
      });
      const all = new Map([...existing].map(([name, f]) => [name, { ...f, parent: byId.get(f.depends_on_field_id)?.label || "" }]));
      for (const [name, f] of incoming) all.set(name, f);
      // Strictly increasing order makes parent links acyclic, including existing children.
      for (const f of all.values()) if (f.parent) {
        const parent = all.get(f.parent);
        if (f.input_type !== "select" || !parent || parent.input_type !== "select" || parent.sort_order >= f.sort_order) throw Error(`Parent must precede child: ${f.label}`);
      }
      const parentIdFor = c => {
        const name = all.get(c.name).parent;
        return options.filter(o => o.field_id === existing.get(name)?.id && o.value === c.parentValue);
      };
      for (const c of choices) if (c.parentValue) {
        const old = parentIdFor(c);
        const added = choices.filter(p => p.name === all.get(c.name).parent && p.value === c.parentValue);
        if (!old.length && !added.length) throw Error(`Missing parent option: ${c.parentValue}`);
      }
      valid = true;
      if (confirm) {
        const statements = [];
        for (const f of [...incoming.values()].sort((a,b) => a.sort_order - b.sort_order)) {
          const old = existing.get(f.label);
          if (old) statements.push(env.DB.prepare("UPDATE tech_daily_field SET label_en=?,label_vi=?,sort_order=?,depends_on_field_id=(SELECT id FROM tech_daily_field WHERE label=?) WHERE id=?").bind(f.label_en || null, f.label_vi || null, f.sort_order, f.parent, old.id));
          else statements.push(env.DB.prepare("INSERT INTO tech_daily_field(label,label_en,label_vi,input_type,sort_order,depends_on_field_id) SELECT ?,?,?,?,?,(SELECT id FROM tech_daily_field WHERE label=?) WHERE NOT EXISTS(SELECT 1 FROM tech_daily_field WHERE label=?)").bind(f.label, f.label_en || null, f.label_vi || null, f.input_type, f.sort_order, f.parent, f.label));
        }
        const claimedOrphans = new Set();
        for (const c of choices.sort((a,b) => all.get(a.name).sort_order - all.get(b.name).sort_order)) {
          const old = options.filter(o => o.field_id === existing.get(c.name)?.id && o.value === c.value && (options.find(p => p.id === o.parent_option_id)?.value || "") === c.parentValue);
          for (const item of old) statements.push(env.DB.prepare("UPDATE tech_daily_field_option SET sort_order=? WHERE id=?").bind(c.order, item.id));
          if (c.parentValue) {
            const orphan = options.find(o => o.field_id === existing.get(c.name)?.id && o.value === c.value && !o.parent_option_id && !claimedOrphans.has(o.id));
            if (!old.length && orphan) {
              claimedOrphans.add(orphan.id);
              statements.push(env.DB.prepare(`UPDATE tech_daily_field_option SET sort_order=?,parent_option_id=(
                SELECT MIN(po.id) FROM tech_daily_field_option po JOIN tech_daily_field pf ON pf.id=po.field_id WHERE pf.label=? AND po.value=?
              ) WHERE id=?`).bind(c.order, all.get(c.name).parent, c.parentValue, orphan.id));
            }
            statements.push(env.DB.prepare(`INSERT INTO tech_daily_field_option(field_id,value,sort_order,parent_option_id)
              SELECT f.id,?,?,po.id FROM tech_daily_field f
              JOIN tech_daily_field pf ON pf.label=?
              JOIN tech_daily_field_option po ON po.field_id=pf.id AND po.value=?
              WHERE f.label=? AND NOT EXISTS(
                SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value=? AND o.parent_option_id=po.id
              )`).bind(c.value, c.order, all.get(c.name).parent, c.parentValue, c.name, c.value));
          } else if (!old.length) {
            statements.push(env.DB.prepare(`INSERT INTO tech_daily_field_option(field_id,value,sort_order,parent_option_id)
              SELECT f.id,?,?,NULL FROM tech_daily_field f WHERE f.label=?
              AND NOT EXISTS(SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value=? AND o.parent_option_id IS NULL)`)
              .bind(c.value, c.order, c.name, c.value));
          }
        }
        await env.DB.batch(statements);
        notice = `${words[5]} (${incoming.size})`; preview = []; valid = false;
      }
    } catch (error) { valid = false; notice = words[6] + (error instanceof Error ? error.message : "CSV"); }
  }
  return html(layout({ title: words[0], user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    ${dailyWorkSubtabs(L, "settings", user)}<h2>${escapeHtml(words[0])}</h2><div class="card"><p>${escapeHtml(words[1])}</p>
    <p><a href="/daily-fields/export?template=1">${escapeHtml(words[2])}</a> · <a href="/daily-fields/export">CSV Export</a> · <a href="/daily-fields">${escapeHtml(words[10])}</a></p>
    <p>입력유형: text / textarea / select · 순서/선택순서: 0–999999 · 상위항목: 항목명 · 상위선택값: 선택값</p>
    <form method="post" enctype="multipart/form-data"><label>CSV UTF-8<input type="file" name="file" accept=".csv" required></label><button>${escapeHtml(words[3])}</button></form></div>
    ${notice ? `<p role="status">${escapeHtml(notice)}</p>` : ""}
    ${preview.length ? `<div class="card" style="overflow-x:auto;"><table><thead><tr>${FIELD_HEADERS.map(h => `<th>${escapeHtml(h)}</th>`).join("")}<th></th></tr></thead><tbody>${preview.map(p => `<tr>${p.r.map(v => `<td>${escapeHtml(v)}</td>`).join("")}<td>${escapeHtml(p.status)}</td></tr>`).join("")}</tbody></table>
    ${valid ? `<form method="post" enctype="multipart/form-data"><input type="hidden" name="confirm" value="1"><textarea name="csv" hidden>${escapeHtml(source)}</textarea><button>${escapeHtml(words[4])}</button></form>` : ""}</div>` : ""}` }));
}

export async function pageDailyFields(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const { fields } = await loadDailyFields(env);
  const standardApplied = new URL(request.url).searchParams.has("standardApplied");
  const fieldById = Object.fromEntries(fields.map((f) => [f.id, f]));
  const fieldTranslations = await buildDisplayTranslationMap(
    env,
    fields.filter((field) => !((lang === "en" && field.label_en) || (lang === "vi" && field.label_vi))).map((field) => field.label),
    lang
  );
  // fields는 이미 sort_order 순으로 정렬되어 있음 — 이 순서가 실제 업데이트 입력 폼
  // (pageDailyItemDetail의 fieldInputs)에 그대로 반영된다. 위/아래 버튼은 인접한 필드와
  // sort_order를 맞바꿔서 순서를 바꾼다.
  const rows = fields.map((f, i) => `
    <tr>
      <td>
        <form method="post" action="/daily-fields/${f.id}/move" class="inline">
          <input type="hidden" name="direction" value="up">
          <button type="submit" class="secondary" title="${escapeHtml(L.moveUpTitle)}" ${i === 0 ? "disabled" : ""}>▲</button>
        </form>
        <form method="post" action="/daily-fields/${f.id}/move" class="inline">
          <input type="hidden" name="direction" value="down">
          <button type="submit" class="secondary" title="${escapeHtml(L.moveDownTitle)}" ${i === fields.length - 1 ? "disabled" : ""}>▼</button>
        </form>
      </td>
      <td>${f.label === "LOTID" ? "LOTID" : `<a href="/daily-fields/${f.id}">${escapeHtml(resolveFieldLabel(f, lang, fieldTranslations))}</a>`}</td>
      <td>${escapeHtml(f.label_en || "-")}</td>
      <td>${escapeHtml(f.label_vi || "-")}</td>
      <td>${escapeHtml(L["inputType" + f.input_type[0].toUpperCase() + f.input_type.slice(1)])}</td>
      <td>${f.input_type === "select" ? f.options.length : "-"}</td>
      <td>${f.depends_on_field_id && fieldById[f.depends_on_field_id] ? escapeHtml(resolveFieldLabel(fieldById[f.depends_on_field_id], lang, fieldTranslations)) : "-"}</td>
    </tr>`).join("");

  // 새로 만드는 필드는 항상 sort_order가 가장 크게 배정되므로, 기존 select 필드는
  // 전부 "더 앞선" 필드가 되어 순환 참조 걱정 없이 상위 항목 후보가 될 수 있다.
  const selectFields = fields.filter((f) => f.input_type === "select");
  const dependsOnOptions = selectFields.map((f) =>
    `<option value="${f.id}">${escapeHtml(resolveFieldLabel(f, lang, fieldTranslations))}</option>`
  ).join("");

  return html(layout({
    title: L.dailyFieldsHeading, user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    ${dailyWorkSubtabs(L, "settings", user)}
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(L.classificationStandardHeading || "일일보고 분류 기준")}</h2>
      ${standardApplied ? `<p role="status">${escapeHtml(L.standardAppliedNotice || "표준 분류와 LOTID를 적용하고 기존 보고 이력을 삭제했습니다.")}</p>` : ""}
      <p class="muted">${escapeHtml(L.standardDesc || "MDL·SSD 통합관리기준의 70개 조합을 사용합니다. 화면에서는 기존 파트명에 맞춰 MDL을 Module로 표시합니다.")}</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0;">
        ${[...DAILY_CLASSIFICATION_FIELDS, "Product Info.", "LOTID", "LOT 조회 결과"].map((label, index, all) => `<span style="display:flex;gap:8px;align-items:center;"><strong style="padding:8px 12px;background:var(--accent-soft);color:var(--accent-soft-text);border-radius:6px;">${escapeHtml(label)}</strong>${index < all.length - 1 ? "→" : ""}</span>`).join("")}
      </div>
      <form method="post" action="/daily-fields/apply-standard" onsubmit="return confirm('${escapeHtml(L.applyStandardConfirm || "기존 일일보고 이력과 현재 항목 설정을 삭제하고 표준 설정으로 교체합니다. 계속하시겠습니까?")}');">
        <button type="submit" class="secondary">${escapeHtml(L.applyStandardBtn || "표준 설정 적용")}</button>
      </form>
    </div>
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(L.newFieldHeading)}</h2>
      <form method="post" action="/daily-fields/new">
        <label>${escapeHtml(L.fieldNameLabel)}</label>
        <input name="name" required>
        <p class="muted">${escapeHtml(L.fieldNameHint)}</p>
        <div class="row">
          <div><label>${escapeHtml(L.fieldInputType)}</label>
            <select name="input_type">
              <option value="text">${escapeHtml(L.inputTypeText)}</option>
              <option value="textarea">${escapeHtml(L.inputTypeTextarea)}</option>
              <option value="select">${escapeHtml(L.inputTypeSelect)}</option>
            </select>
          </div>
          <div><label>${escapeHtml(L.dependsOnLabel)}</label>
            <select name="depends_on_field_id">
              <option value="">${escapeHtml(L.dependsOnNone)}</option>
              ${dependsOnOptions}
            </select>
          </div>
        </div>
        <p class="muted">${escapeHtml(L.dependsOnHint)}</p>
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(L.dailyItemsHeading)}</h2>
      <p><a href="/daily-fields/import">CSV Import</a> · <a href="/daily-fields/export">CSV Export</a></p>
      <table>
        <thead><tr><th>${escapeHtml(L.colSortOrder)}</th><th>${escapeHtml(L.fieldLabel)}</th><th>${escapeHtml(L.colLabelEn)}</th><th>${escapeHtml(L.colLabelVi)}</th><th>${escapeHtml(L.fieldInputType)}</th><th>${escapeHtml(L.colOptions)}</th><th>${escapeHtml(L.dependsOnLabel)}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">${escapeHtml(L.noItems)}</td></tr>`}</tbody>
      </table>
    </div>` }));
}

export async function handleDailyFieldCreate(request, env, user) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const inputType = ["text", "textarea", "select"].includes(String(form.get("input_type"))) ? String(form.get("input_type")) : "text";
  if (!name) return redirect("/daily-fields");

  // depends_on 은 select 타입 필드에만 의미가 있고, 대상도 반드시 실제 존재하는 select 필드여야 한다.
  let dependsOnFieldId = null;
  const rawDependsOn = String(form.get("depends_on_field_id") || "").trim();
  if (inputType === "select" && rawDependsOn) {
    const target = await env.DB.prepare(`SELECT id FROM tech_daily_field WHERE id = ? AND input_type = 'select'`).bind(rawDependsOn).first();
    if (target) dependsOnFieldId = target.id;
  }

  const tri = await resolveTrilingualText(env, name);
  const label = tri.ko || name;
  if (hasDailyClassification((await loadDailyFields(env)).fields) && (RETIRED_DAILY_FIELDS.has(label) || RETIRED_DAILY_FIELDS.has(name) || label === "LOTID" || name === "LOTID")) return plainText(lotWords[getLang(request)].retired, 400);

  const max = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM tech_daily_field`).first();
  await env.DB.prepare(
    `INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order, depends_on_field_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(label, tri.en, tri.vi, inputType, (max.m || 0) + 10, dependsOnFieldId).run();

  return redirect("/daily-fields");
}

export async function pageDailyFieldDetail(request, env, user, id) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return html(layout({ title: L.notFoundTitle, user, lang, body: `<div class="card">${escapeHtml(L.fieldNotFound)}</div>` }), 404);

  const url = new URL(request.url);
  const importNotice = url.searchParams.has("imported")
    ? L.importResultTemplate
        .replace("{added}", url.searchParams.get("imported"))
        .replace("{skipped}", url.searchParams.get("skipped") || "0")
    : null;
  const deleteBlockedNotice = url.searchParams.has("deleteBlocked")
    ? L.deleteFieldInUse.replace("{count}", url.searchParams.get("deleteBlocked") || "0")
    : null;

  // depends_on 후보: 자기 자신을 제외한 select 필드 중, 자기보다 먼저 만들어진(=sort_order가
  // 더 작은) 필드만 — 이래야 상위 필드가 반드시 먼저 존재해서 순환 참조가 생기지 않는다.
  const { fields: allFields } = await loadDailyFields(env);
  const parentCandidates = allFields.filter((f) => f.input_type === "select" && f.id !== field.id && f.sort_order < field.sort_order);
  const dependsOnField = field.depends_on_field_id ? allFields.find((f) => f.id === field.depends_on_field_id) : null;
  const parentOptions = dependsOnField ? dependsOnField.options : [];
  const settingsTranslations = await buildDisplayTranslationMap(env, [
    ...allFields.filter((candidate) => !((lang === "en" && candidate.label_en) || (lang === "vi" && candidate.label_vi))).map((candidate) => candidate.label),
    ...allFields.flatMap((candidate) => candidate.options.map((option) => option.value)),
  ], lang);
  const parentRequiredNotice = (url.searchParams.has("needsParent") && dependsOnField)
    ? L.parentOptionRequiredNotice.replace("{label}", resolveFieldLabel(dependsOnField, lang, settingsTranslations))
    : null;

  const options = await env.DB.prepare(`SELECT * FROM tech_daily_field_option WHERE field_id = ? ORDER BY sort_order, id`).bind(id).all();
  const isManagedStatusField = field.label === "상태";
  const parentValueById = Object.fromEntries(parentOptions.map((o) => [o.id, resolveOptionValue(o.value, lang, settingsTranslations, dependsOnField?.label === "상태")]));
  const optionRows = options.results.map((o) => `
    <tr>
      ${dependsOnField ? `<td>${escapeHtml(o.parent_option_id ? (parentValueById[o.parent_option_id] || "-") : "-")}</td>` : ""}
      <td>${escapeHtml(resolveOptionValue(o.value, lang, settingsTranslations, isManagedStatusField))}</td>
      <td>${isManagedStatusField ? "" : `<form method="post" action="/daily-fields/${field.id}/options/${o.id}/delete" onsubmit="return confirm('${escapeHtml(L.deleteOptionConfirm)}');">
        <button type="submit" class="danger">${escapeHtml(L.deleteBtn)}</button>
      </form>`}</td>
    </tr>`).join("");

  const dependsOnOptionsHtml = parentCandidates.map((f) =>
    `<option value="${f.id}" ${field.depends_on_field_id === f.id ? "selected" : ""}>${escapeHtml(resolveFieldLabel(f, lang, settingsTranslations))}</option>`
  ).join("");

  const parentOptionSelect = dependsOnField ? `<select name="parent_option_id" required>
      <option value="">-</option>
      ${parentOptions.map((o) => `<option value="${o.id}">${escapeHtml(resolveOptionValue(o.value, lang, settingsTranslations, dependsOnField?.label === "상태"))}</option>`).join("")}
    </select>` : "";

  const canAddOptions = !isManagedStatusField && (!dependsOnField || parentOptions.length > 0);
  const addOptionForm = isManagedStatusField
    ? `<p class="muted">${escapeHtml(L.statusOptionsManagedNotice)}</p>`
    : !canAddOptions
    ? `<p class="muted">${escapeHtml(L.noParentOptionsNotice.replace("{label}", resolveFieldLabel(dependsOnField, lang, settingsTranslations)))}</p>`
    : `<form method="post" action="/daily-fields/${field.id}/options/new" class="row">
        ${dependsOnField ? `<div><label>${escapeHtml(L.parentOptionLabel)}</label>${parentOptionSelect}</div>` : ""}
        <div><label>${escapeHtml(L.addOptionPlaceholder)}</label><input name="value" placeholder="${escapeHtml(L.addOptionPlaceholder)}" required></div>
        <div style="flex:0;align-self:end;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>`;

  const bulkImportForm = !canAddOptions ? "" : `
    <div class="card">
      <h3 style="margin-top:0;">${escapeHtml(L.bulkAddOptionsHeading)}</h3>
      <p class="muted">${escapeHtml(L.bulkAddNotice)}</p>
      <form method="post" action="/daily-fields/${field.id}/options/import" enctype="multipart/form-data">
        ${dependsOnField ? `<label>${escapeHtml(L.parentOptionLabel)}</label>${parentOptionSelect}` : ""}
        <label>${escapeHtml(L.bulkAddFileLabel)}</label>
        <input type="file" name="csv_file" accept=".csv,.txt">
        <label>${escapeHtml(L.bulkAddPasteLabel)}</label>
        <textarea name="csv_text" placeholder="OCAP&#10;분석/Issue"></textarea>
        <label><input type="checkbox" name="skip_header" style="width:auto;"> ${escapeHtml(L.skipHeaderLabel)}</label>
        <div style="margin-top:8px;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>`;

  return html(layout({
    title: resolveFieldLabel(field, lang, settingsTranslations), user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    <p><a href="/daily-fields">${escapeHtml(L.backToList)}</a></p>
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(resolveFieldLabel(field, lang, settingsTranslations))}</h2>
      ${deleteBlockedNotice ? `<p class="err">${escapeHtml(deleteBlockedNotice)}</p>` : ""}
      <form method="post" action="/daily-fields/${field.id}">
        <label>${escapeHtml(L.fieldNameLabel)}</label>
        <input name="name" value="${escapeHtml(resolveFieldLabel(field, lang, settingsTranslations))}" required>
        <p class="muted">${escapeHtml(L.fieldNameHint)}</p>
        <div class="row">
          <div><label>${escapeHtml(L.fieldInputType)}</label>
            <select name="input_type">
              <option value="text" ${field.input_type === "text" ? "selected" : ""}>${escapeHtml(L.inputTypeText)}</option>
              <option value="textarea" ${field.input_type === "textarea" ? "selected" : ""}>${escapeHtml(L.inputTypeTextarea)}</option>
              <option value="select" ${field.input_type === "select" ? "selected" : ""}>${escapeHtml(L.inputTypeSelect)}</option>
            </select>
          </div>
          <div><label>${escapeHtml(L.dependsOnLabel)}</label>
            <select name="depends_on_field_id">
              <option value="">${escapeHtml(L.dependsOnNone)}</option>
              ${dependsOnOptionsHtml}
            </select>
          </div>
        </div>
        <p class="muted">${escapeHtml(L.dependsOnHint)}</p>
        <div style="margin-top:12px;"><button type="submit">${escapeHtml(L.save)}</button></div>
      </form>
      <form method="post" action="/daily-fields/${field.id}/delete" style="margin-top:12px;" onsubmit="return confirm('${escapeHtml(L.deleteFieldConfirm)}');">
        <button type="submit" class="danger">${escapeHtml(L.deleteBtn)}</button>
      </form>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">${escapeHtml(L.optionsHeading)}</h3>
      ${importNotice ? `<p class="muted">${escapeHtml(importNotice)}</p>` : ""}
      ${parentRequiredNotice ? `<p class="err">${escapeHtml(parentRequiredNotice)}</p>` : ""}
      ${addOptionForm}
      <table>
        <thead><tr><th></th>${dependsOnField ? `<th>${escapeHtml(L.colParentOption)}</th>` : ""}<th>${escapeHtml(L.fieldLabel)}</th><th></th></tr></thead>
        <tbody>${optionRows || `<tr><td colspan="${dependsOnField ? 3 : 2}" class="muted">${escapeHtml(L.noItems)}</td></tr>`}</tbody>
      </table>
    </div>
    ${bulkImportForm}` }));
}

export async function handleDailyFieldUpdate(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const lang = getLang(request);
  const form = await request.formData();
  if (hasDailyClassification((await loadDailyFields(env)).fields) && (RETIRED_DAILY_FIELDS.has(String(form.get("name") || "").trim()) || String(form.get("name") || "").trim() === "LOTID")) return plainText(lotWords[getLang(request)].retired, 400);
  const name = String(form.get("name") || "").trim();
  const inputType = ["text", "textarea", "select"].includes(String(form.get("input_type"))) ? String(form.get("input_type")) : "text";
  if (!name) return redirect(`/daily-fields/${id}`);

  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");

  let dependsOnFieldId = null;
  const rawDependsOn = String(form.get("depends_on_field_id") || "").trim();
  if (inputType === "select" && rawDependsOn) {
    const target = await env.DB.prepare(
      `SELECT id FROM tech_daily_field WHERE id = ? AND input_type = 'select' AND id != ? AND sort_order < ?`
    ).bind(rawDependsOn, id, field.sort_order).first();
    if (target) dependsOnFieldId = target.id;
  }

  // 관리자가 지금 보고 있던(=현재 화면 언어로 보이던) 이름 그대로 다시 제출했다면 이름은
  // 안 바꾼 것이므로 재번역하지 않는다 — input_type만 바꾸는 흔한 경우에 매번 AI를
  // 호출해서 저장이 느려지는 걸 막기 위함.
  const unchanged = name === resolveFieldLabel(field, lang);
  const tri = unchanged
    ? { ko: field.label, en: field.label_en, vi: field.label_vi }
    : await resolveTrilingualText(env, name);
  const label = tri.ko || name;
  if (hasDailyClassification((await loadDailyFields(env)).fields) && (RETIRED_DAILY_FIELDS.has(label) || label === "LOTID")) return plainText(lotWords[lang].retired, 400);

  await env.DB.prepare(`UPDATE tech_daily_field SET label = ?, label_en = ?, label_vi = ?, input_type = ?, depends_on_field_id = ? WHERE id = ?`)
    .bind(label, tri.en, tri.vi, inputType, dependsOnFieldId, id).run();

  // 이 필드가 더 이상 select 타입이 아니면, 이 필드에 의존하던 다른 필드들은 상위 항목을 잃는다.
  if (inputType !== "select") {
    await env.DB.prepare(`UPDATE tech_daily_field SET depends_on_field_id = NULL WHERE depends_on_field_id = ?`).bind(id).run();
  }

  return redirect(`/daily-fields/${id}`);
}

export async function handleDailyFieldDelete(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const { count } = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tech_daily_update_value WHERE field_id = ?`
  ).bind(id).first();
  if (count > 0) return redirect(`/daily-fields/${id}?deleteBlocked=${count}`);
  await env.DB.prepare(`DELETE FROM tech_daily_field WHERE id = ?`).bind(id).run();
  return redirect("/daily-fields");
}

// 인접한 필드와 sort_order 를 맞바꿔서 순서를 한 칸 옮긴다. 전역 정렬 기준인
// `ORDER BY sort_order, id`와 동일한 규칙으로 "바로 앞/뒤" 필드를 찾는다.
export async function handleDailyFieldMove(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const form = await request.formData();
  const direction = String(form.get("direction") || "");

  const field = await env.DB.prepare(`SELECT id, sort_order FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");

  const neighbor = direction === "up"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_daily_field WHERE (sort_order < ?) OR (sort_order = ? AND id < ?) ORDER BY sort_order DESC, id DESC LIMIT 1`
      ).bind(field.sort_order, field.sort_order, field.id).first()
    : direction === "down"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_daily_field WHERE (sort_order > ?) OR (sort_order = ? AND id > ?) ORDER BY sort_order ASC, id ASC LIMIT 1`
      ).bind(field.sort_order, field.sort_order, field.id).first()
    : null;

  if (neighbor) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE tech_daily_field SET sort_order = ? WHERE id = ?`).bind(neighbor.sort_order, field.id),
      env.DB.prepare(`UPDATE tech_daily_field SET sort_order = ? WHERE id = ?`).bind(field.sort_order, neighbor.id),
    ]);
  }

  return redirect("/daily-fields");
}

// depends_on_field_id 가 있는 필드는 반드시 그 상위 필드에 실제로 속한 선택지 id 를
// 받아야 한다 — 그래야 다른 필드의 선택지 id 를 잘못 넣는 걸 막을 수 있다.
export async function resolveParentOptionId(env, field, rawParentOptionId) {
  if (!field.depends_on_field_id) return null;
  const parentId = String(rawParentOptionId || "").trim();
  if (!parentId) return undefined; // 상위 선택지가 필요한데 안 골랐음 — 호출부에서 거부 처리
  const parentOption = await env.DB.prepare(
    `SELECT id FROM tech_daily_field_option WHERE id = ? AND field_id = ?`
  ).bind(parentId, field.depends_on_field_id).first();
  return parentOption ? parentOption.id : undefined;
}

export async function handleDailyFieldOptionCreate(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");
  if (field.label === "상태") return redirect(`/daily-fields/${id}`);

  const form = await request.formData();
  const value = String(form.get("value") || "").trim();
  const parentOptionId = await resolveParentOptionId(env, field, form.get("parent_option_id"));

  if (parentOptionId === undefined) return redirect(`/daily-fields/${id}?needsParent=1`);

  if (value) {
    await warmTranslationCache(env, [value]);
    const max = await env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM tech_daily_field_option WHERE field_id = ?`
    ).bind(id).first();
    await env.DB.prepare(
      `INSERT INTO tech_daily_field_option (field_id, value, sort_order, parent_option_id) VALUES (?, ?, ?, ?)`
    ).bind(id, value, (max.m || 0) + 10, parentOptionId).run();
  }
  return redirect(`/daily-fields/${id}`);
}

export async function handleDailyFieldOptionDelete(request, env, user, fieldId, optionId) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const field = await env.DB.prepare(`SELECT label FROM tech_daily_field WHERE id = ?`).bind(fieldId).first();
  if (field?.label === "상태") return redirect(`/daily-fields/${fieldId}`);
  await env.DB.prepare(`DELETE FROM tech_daily_field_option WHERE id = ? AND field_id = ?`).bind(optionId, fieldId).run();
  return redirect(`/daily-fields/${fieldId}`);
}

// 한 줄에 값 하나. 쉼표가 있으면 첫 번째 칸만 값으로 쓴다(간단한 선택지 목록용이라
// 따옴표로 감싼 필드 안의 쉼표 같은 완전한 CSV 이스케이프 규칙까지는 다루지 않는다).
export function parseCsvValues(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.split(",")[0].trim().replace(/^"(.*)"$/, "$1").trim())
    .filter((v) => v);
}

export async function handleDailyFieldOptionImport(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");
  if (field.label === "상태") return redirect(`/daily-fields/${id}`);

  const form = await request.formData();
  const file = form.get("csv_file");
  const pasted = String(form.get("csv_text") || "");
  const skipHeader = form.get("skip_header") === "on";
  const parentOptionId = await resolveParentOptionId(env, field, form.get("parent_option_id"));

  if (parentOptionId === undefined) return redirect(`/daily-fields/${id}?needsParent=1`);

  const text = (file && typeof file.text === "function" && file.size > 0) ? await file.text() : pasted;
  let values = parseCsvValues(text);
  if (skipHeader) values = values.slice(1);
  await warmTranslationCache(env, values);

  // 중복 체크는 (field_id, parent_option_id) 조합 안에서만 한다 — 같은 값이라도
  // 다른 상위 선택지 아래에서는 별개의 선택지로 취급되어야 하기 때문.
  const [existing, max] = await Promise.all([
    parentOptionId === null
      ? env.DB.prepare(`SELECT value FROM tech_daily_field_option WHERE field_id = ? AND parent_option_id IS NULL`).bind(id).all()
      : env.DB.prepare(`SELECT value FROM tech_daily_field_option WHERE field_id = ? AND parent_option_id = ?`).bind(id, parentOptionId).all(),
    env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM tech_daily_field_option WHERE field_id = ?`).bind(id).first(),
  ]);
  const existingSet = new Set(existing.results.map((o) => o.value));
  let order = max.m || 0;
  let skipped = 0;
  const seen = new Set();
  const inserts = [];
  for (const v of values) {
    if (existingSet.has(v) || seen.has(v)) { skipped++; continue; }
    seen.add(v);
    order += 10;
    inserts.push(env.DB.prepare(
      `INSERT INTO tech_daily_field_option (field_id, value, sort_order, parent_option_id) VALUES (?, ?, ?, ?)`
    ).bind(id, v, order, parentOptionId));
  }
  // 한 묶음으로 저장해 중간 실패 시 일부 선택지만 남지 않게 한다.
  if (inserts.length) await env.DB.batch(inserts);

  return redirect(`/daily-fields/${id}?imported=${inserts.length}&skipped=${skipped}`);
}

// #endregion

export async function handleDailyFieldOptionMove(request, env, user, fieldId, optionId) {
  if (user.role !== "admin") return redirect(`/daily-fields/${fieldId}`);
  const form = await request.formData();
  const direction = String(form.get("direction") || "");

  const option = await env.DB.prepare(
    `SELECT id, field_id, sort_order, parent_option_id FROM tech_daily_field_option WHERE id = ? AND field_id = ?`
  ).bind(optionId, fieldId).first();
  if (!option) return redirect(`/daily-fields/${fieldId}`);

  const parentClause = option.parent_option_id === null
    ? `parent_option_id IS NULL`
    : `parent_option_id = ?`;
  const parentParams = option.parent_option_id === null ? [] : [option.parent_option_id];

  const neighbor = direction === "up"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_daily_field_option 
          WHERE field_id = ? AND ${parentClause} AND ((sort_order < ?) OR (sort_order = ? AND id < ?))
          ORDER BY sort_order DESC, id DESC LIMIT 1`
      ).bind(fieldId, ...parentParams, option.sort_order, option.sort_order, option.id).first()
    : direction === "down"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_daily_field_option 
          WHERE field_id = ? AND ${parentClause} AND ((sort_order > ?) OR (sort_order = ? AND id > ?))
          ORDER BY sort_order ASC, id ASC LIMIT 1`
      ).bind(fieldId, ...parentParams, option.sort_order, option.sort_order, option.id).first()
    : null;

  if (neighbor) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE tech_daily_field_option SET sort_order = ? WHERE id = ?`).bind(neighbor.sort_order, option.id),
      env.DB.prepare(`UPDATE tech_daily_field_option SET sort_order = ? WHERE id = ?`).bind(option.sort_order, neighbor.id),
    ]);
  }

  return redirect(`/daily-fields/${fieldId}`);
}
