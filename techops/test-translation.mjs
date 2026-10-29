import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from './worker.js';

export async function testTranslationEfficiency({ check, makeEnv }) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    db.exec(`
      INSERT INTO techops_users (username,password_hash,password_salt,display_name,role)
        VALUES ('audit@example.test','unused','unused','Audit User','admin');
      INSERT INTO techops_sessions (id,user_id,expires_at) VALUES ('audit-session',1,'2099-01-01 00:00:00');
      DELETE FROM tech_daily_field_option;
      DELETE FROM tech_daily_field;
      INSERT INTO tech_daily_item (part,category,title,owner) VALUES ('SSD','평가','검사','Tester');
      INSERT INTO tech_daily_item (part,category,title,owner) VALUES ('Module','평가','숨겨진 모듈 검사','Tester');
      INSERT INTO tech_daily_field (label,label_en,label_vi,input_type) VALUES
        ('검사 내용','Inspection','Inspection','textarea'),
        ('검사 메모','Notes','Notes','textarea'),
        ('파트넘버','Part number','Part number','text');
    `);
    const fields = db.prepare('SELECT id,label FROM tech_daily_field').all();
    const fieldId = label => fields.find(field => field.label === label).id;
    const calls = [];
    let failTranslation = false;
    const env = { ...makeEnv(db), AI: { async run(model, input) {
      calls.push(input);
      if (failTranslation && input.text === 'Retry inspection') throw Error('synthetic AI outage');
      return { translated_text: `${input.target_lang}:${input.text}` };
    } } };
    const headers = { cookie: 'session=audit-session; lang=en', 'content-type': 'application/x-www-form-urlencoded' };
    const count = text => calls.filter(call => call.text === text).length;
    const save = text => worker.fetch(new Request('https://x/daily-items/1/updates', {
      method: 'POST', headers, body: new URLSearchParams({ report_date: '2026-09-23',
        [`field_${fieldId('검사 내용')}`]: text,
        [`field_${fieldId('검사 메모')}`]: text,
        [`field_${fieldId('파트넘버')}`]: 'MZ-TEST-0001',
      }),
    }), env, {});

    let response = await save('Inspect audit fixture');
    check('identical free text in two fields uses only two target-language AI calls', response.status === 302 && count('Inspect audit fixture') === 2);
    response = await save('Inspect audit fixture');
    check('repeated report text reuses persistent translations without more AI calls', response.status === 302 && count('Inspect audit fixture') === 2);
    const parts = db.prepare('SELECT value,value_en,value_vi FROM tech_daily_update_value WHERE field_id=?').all(fieldId('파트넘버'));
    check('part numbers preserve exact original values in all languages without AI', parts.length === 2 && parts.every(row => Object.values(row).every(value => value === 'MZ-TEST-0001')) && count('MZ-TEST-0001') === 0);

    failTranslation = true;
    response = await save('Retry inspection');
    const failedValues = db.prepare('SELECT value_en,value_vi FROM tech_daily_update_value WHERE update_id=(SELECT MAX(id) FROM tech_daily_update) AND field_id=?').get(fieldId('검사 내용'));
    check('AI failure preserves missing translation slots for a later retry', response.status === 302 && failedValues.value_vi === null && !db.prepare('SELECT 1 FROM tech_translation_cache WHERE source_text=?').get('Retry inspection'));
    failTranslation = false;
    const attempts = count('Retry inspection');
    response = await save('Retry inspection');
    check('failed translations are retried and successful results enter the cache', response.status === 302 && count('Retry inspection') === attempts + 2 && db.prepare('SELECT value_vi FROM tech_translation_cache WHERE source_text=?').get('Retry inspection')?.value_vi === 'vi:Retry inspection');

    db.prepare('UPDATE tech_daily_update_value SET value=?,value_en=?,value_vi=NULL WHERE field_id=?').run('MZ-LEGACY-0002','WRONG-PART',fieldId('파트넘버'));
    for (const route of ['/daily-items/1','/daily-reports?date=2026-09-23&part=SSD']) {
      response = await worker.fetch(new Request('https://x' + route, { headers }), env, {});
      const html = await response.text();
      check(`identifier display ignores old translated values on ${route}`, response.status === 200 && html.includes('MZ-LEGACY-0002') && !html.includes('WRONG-PART') && count('MZ-LEGACY-0002') === 0);
    }
    check('SSD report does not spend AI calls on hidden Module item titles', count('숨겨진 모듈 검사') === 0);

    const beforeCached = calls.length;
    const ai = env.AI;
    env.AI = undefined;
    response = await save('Inspect audit fixture');
    const cachedValues = db.prepare('SELECT value,value_en,value_vi FROM tech_daily_update_value WHERE update_id=(SELECT MAX(id) FROM tech_daily_update) AND field_id=?').get(fieldId('검사 내용'));
    check('cached text remains translated when the AI binding is unavailable', response.status === 302 && cachedValues.value === 'ko:Inspect audit fixture' && cachedValues.value_vi === 'vi:Inspect audit fixture' && calls.length === beforeCached);
    env.AI = ai;
    db.exec('DROP TABLE tech_translation_cache');
    response = await save('Uncached inspection');
    const uncachedValues = db.prepare('SELECT value_vi FROM tech_daily_update_value WHERE update_id=(SELECT MAX(id) FROM tech_daily_update) AND field_id=?').get(fieldId('검사 내용'));
    check('a missing cache table does not prevent saving successful translations', response.status === 302 && uncachedValues.value_vi === 'vi:Uncached inspection' && count('Uncached inspection') === 2);
  } finally { db.close(); }
}
