import worker from './worker.js';

export async function testUserManagement({ db, env, check, adminHeaders }) {
  const insert = (sql, ...params) => Number(db.prepare(sql).run(...params).lastInsertRowid);
  const id = insert(`INSERT INTO techops_users(username,password_hash,password_salt,display_name,role)
    VALUES('account-edit@hanyangdgtvina.com','original-hash','original-salt','수정 대상','member')`);
  const otherId = insert(`INSERT INTO techops_users(username,password_hash,password_salt,display_name,role,email_verified_at)
    VALUES('account-other@hanyangdgtvina.com','x','x','다른 사용자','member',datetime('now'))`);
  const adminId = db.prepare("SELECT id FROM techops_users WHERE username='admin'").get().id;
  const anotherAdmin = insert(`INSERT INTO techops_users(username,password_hash,password_salt,display_name,role,email_verified_at)
    VALUES('other-admin','x','x','다른 관리자','admin',datetime('now'))`);
  db.prepare("INSERT INTO techops_sessions(id,user_id,expires_at) VALUES('account-other-session',?,datetime('now','+1 day'))").run(otherId);
  const memberHeaders = { cookie: 'session=account-other-session' };
  const call = (action, { target = id, method = 'GET', headers = adminHeaders, values = {}, database = env } = {}) => worker.fetch(new Request(`https://x/admin/users/${target}/${action}`, {
    method, headers, ...(method === 'POST' ? { body: new URLSearchParams(values) } : {}),
  }), database, {});
  const account = () => db.prepare('SELECT * FROM techops_users WHERE id=?').get(id);
  const initial = JSON.stringify(account());

  for (const action of ['edit', 'delete']) {
    for (const method of ['GET', 'POST']) {
      const anonymous = await call(action, { method, headers: {} });
      check(`account ${action} ${method}: anonymous redirected`, anonymous.status === 302 && anonymous.headers.get('location') === '/login');
      check(`account ${action} ${method}: member denied`, (await call(action, { method, headers: memberHeaders })).status === 403);
      for (const target of [adminId, anotherAdmin]) check(`account ${action} ${method}: admin ${target} protected`, (await call(action, { target, method })).status === 403);
    }
    const crossOrigin = await call(action, { method: 'POST', headers: { ...adminHeaders, origin: 'https://evil.example' }, values: { confirm_delete: 'yes' } });
    check(`account ${action}: cross-origin denied`, crossOrigin.status === 403);
    check(`account ${action}: missing target returns 404`, (await call(action, { target: 999999 })).status === 404);
  }
  check('denied account requests leave target unchanged', JSON.stringify(account()) === initial);

  for (const [lang, edit, remove] of [['ko', '정보 수정', '계정 삭제'], ['en', 'Edit Account', 'Delete Account'], ['vi', 'Sửa tài khoản', 'Xóa tài khoản']]) {
    const headers = { cookie: `${adminHeaders.cookie}; lang=${lang}` };
    const page = await worker.fetch(new Request('https://x/admin/users', { headers }), env, {});
    const html = await page.text();
    check(`account controls translated in ${lang}, pending members included and admins excluded`, html.includes(edit) && html.includes(remove)
      && html.includes(`/admin/users/${id}/edit`) && html.includes(`/admin/users/${id}/delete`)
      && !html.includes(`/admin/users/${adminId}/edit`) && !html.includes(`/admin/users/${anotherAdmin}/delete`));
    const form = await call('edit', { headers });
    const formHtml = await form.text();
    check(`account edit form in ${lang} has populated fields`, form.status === 200 && formHtml.includes('name="display_name"') && formHtml.includes('account-edit@hanyangdgtvina.com') && !formHtml.includes('undefined'));
  }
  const confirmation = await call('delete');
  check('delete GET only displays target and required confirmation', confirmation.status === 200 && (await confirmation.text()).includes('name="confirm_delete"') && JSON.stringify(account()) === initial);
  check('delete POST requires explicit confirmation', (await call('delete', { method: 'POST' })).status === 400 && !!account());

  const goodValues = { username: account().username, display_name: '변경 이름' };
  for (const values of [
    { ...goodValues, username: 'bad@example.com' }, { ...goodValues, username: 'two@@hanyangdgtvina.com' },
    { ...goodValues, username: 'ACCOUNT-OTHER@hanyangdgtvina.com' },
    { ...goodValues, display_name: '   ' }, { ...goodValues, display_name: '가'.repeat(101) },
  ]) check('invalid or duplicate account fields rejected without changes', (await call('edit', { method: 'POST', values })).status === 400 && JSON.stringify(account()) === initial);

  function addCredentials() {
    db.prepare("INSERT OR REPLACE INTO techops_sessions(id,user_id,expires_at) VALUES('account-target-session',?,datetime('now','+1 day'))").run(id);
    for (const table of ['techops_password_resets', 'techops_email_verifications']) db.prepare(`INSERT OR REPLACE INTO ${table}(token,user_id,expires_at) VALUES('account-target-token',?,datetime('now','+1 day'))`).run(id);
    db.prepare('INSERT OR REPLACE INTO techops_login_attempts(username,fail_count) VALUES(?,5)').run(account().username);
  }
  const credentialsExist = () => ['techops_sessions', 'techops_password_resets', 'techops_email_verifications'].every(table => !!db.prepare(`SELECT 1 FROM ${table} WHERE user_id=?`).get(id));
  addCredentials();
  let response = await call('edit', { method: 'POST', values: { ...goodValues, display_name: '<script>alert(1)</script>', role: 'admin', email_verified_at: '2026-01-01' } });
  check('name edit preserves password, role, pending approval, and sessions', response.status === 302 && account().password_hash === 'original-hash' && account().role === 'member' && account().email_verified_at === null && credentialsExist());
  const escaped = await (await call('edit')).text();
  check('edited name is escaped when rendered', escaped.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !escaped.includes('<script>alert(1)</script>'));

  const renamedValues = { username: ' ACCOUNT-RENAMED@HANYANGDGTVINA.COM ', display_name: ' 새 이름 ' };
  db.exec(`CREATE TRIGGER fail_account_edit BEFORE UPDATE ON techops_users WHEN OLD.id=${id} BEGIN SELECT RAISE(ABORT, 'injected account edit failure'); END;`);
  response = await call('edit', { method: 'POST', values: renamedValues });
  check('email edit failure rolls back account and all credential deletions', response.status === 500 && account().username === goodValues.username && credentialsExist() && !!db.prepare('SELECT 1 FROM techops_login_attempts WHERE username=?').get(goodValues.username));
  db.exec('DROP TRIGGER fail_account_edit');
  response = await call('edit', { method: 'POST', values: renamedValues });
  check('email edit normalizes fields and preserves pending approval', response.status === 302 && response.headers.get('location') === '/admin/users?result=saved' && account().username === 'account-renamed@hanyangdgtvina.com' && account().display_name === '새 이름' && account().email_verified_at === null);
  check('email edit removes old sessions, reset/verification tokens, and lockouts', !credentialsExist() && ['techops_sessions', 'techops_password_resets', 'techops_email_verifications'].every(table => !db.prepare(`SELECT 1 FROM ${table} WHERE user_id=?`).get(id)) && !db.prepare('SELECT 1 FROM techops_login_attempts WHERE username=?').get(goodValues.username));
  check('email change invalidates the previous session', (await worker.fetch(new Request('https://x/tasks', { headers: { cookie: 'session=account-target-session' } }), env, {})).headers.get('location') === '/login');
  db.prepare("UPDATE techops_users SET email_verified_at='2026-09-16' WHERE id=?").run(id);
  response = await call('edit', { method: 'POST', values: { username: 'account-final@hanyangdgtvina.com', display_name: '최종 이름' } });
  check('email edit retains existing administrator approval', response.status === 302 && account().email_verified_at === '2026-09-16');

  // Exercise every business reference with real SQLite foreign keys and child rows.
  check('account deletion tests enforce foreign keys', db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1);
  const taskId = insert("INSERT INTO tech_task(title,owner,created_by) VALUES('보존 업무','최종 이름',?)", id);
  const updateId = insert("INSERT INTO tech_update(task_id,content,author_id) VALUES(?,'보존 진행',?)", taskId, id);
  const dailyId = insert("INSERT INTO tech_daily_item(part,title,owner,created_by) VALUES('SSD','보존 일일업무','최종 이름',?)", id);
  const dailyUpdateId = insert("INSERT INTO tech_daily_update(item_id,report_date,author_id) VALUES(?,'2026-09-16',?)", dailyId, id);
  const fieldId = db.prepare('SELECT id FROM tech_daily_field LIMIT 1').get().id;
  db.prepare("INSERT INTO tech_daily_update_value(update_id,field_id,value) VALUES(?,?,'보존 보고값')").run(dailyUpdateId, fieldId);
  const archiveId = insert("INSERT INTO tech_daily_report(report_date,part,content,created_by) VALUES('2026-09-16','SSD','보존 아카이브',?)", id);
  const reportId = insert("INSERT INTO tech_report_log(content,generated_by) VALUES('보존 보고',?)", id);
  const setId = insert("INSERT INTO tech_master_set(code,name_ko,name_en,name_vi,owner_user_id) VALUES('ACCOUNT_TEST','보존','keep','keep',?)", id);
  const rowId = insert("INSERT INTO tech_master_row(set_id,row_key,data_json,created_by,updated_by) VALUES(?,'account-test','{}',?,?)", setId, id, id);
  const logId = insert("INSERT INTO tech_master_log(set_id,row_id,action,actor_user_id) VALUES(?,?,'INSERT',?)", setId, rowId, id);
  db.prepare("INSERT INTO tech_lot_info(lot_id,data_json,source_filename,imported_by) VALUES('ACCOUNT-TEST-LOT','{}','test.xlsx',?)").run(id);
  const refs = [['tech_task','created_by',taskId],['tech_update','author_id',updateId],['tech_daily_item','created_by',dailyId],['tech_daily_update','author_id',dailyUpdateId],['tech_daily_report','created_by',archiveId],['tech_report_log','generated_by',reportId],['tech_master_set','owner_user_id',setId],['tech_master_row','created_by',rowId],['tech_master_row','updated_by',rowId],['tech_master_log','actor_user_id',logId]];
  addCredentials();
  db.exec(`CREATE TRIGGER fail_account_delete BEFORE DELETE ON techops_users WHEN OLD.id=${id} BEGIN SELECT RAISE(ABORT, 'injected account delete failure'); END;`);
  response = await call('delete', { method: 'POST', values: { confirm_delete: 'yes' } });
  check('delete failure rolls back all business reference and credential changes', response.status === 500 && !!account() && credentialsExist() && refs.every(([table,col,row]) => db.prepare(`SELECT ${col} AS owner FROM ${table} WHERE id=?`).get(row)?.owner === id)
    && db.prepare("SELECT imported_by FROM tech_lot_info WHERE lot_id='ACCOUNT-TEST-LOT'").get().imported_by === id);
  db.exec('DROP TRIGGER fail_account_delete');

  // Simulate a promotion after target lookup and before the D1 transaction.
  for (const action of ['edit', 'delete']) {
    const raceEnv = { ...env, DB: { prepare: sql => env.DB.prepare(sql), batch: async statements => {
      db.prepare("UPDATE techops_users SET role='admin' WHERE id=?").run(id);
      return env.DB.batch(statements);
    } } };
    response = await call(action, { method: 'POST', database: raceEnv, values: { username: 'race@hanyangdgtvina.com', display_name: 'race', confirm_delete: 'yes' } });
    check(`concurrent promotion prevents ${action} and preserves dependencies`, response.status === 409 && account().username === 'account-final@hanyangdgtvina.com' && credentialsExist() && refs.every(([table,col,row]) => db.prepare(`SELECT ${col} AS owner FROM ${table} WHERE id=?`).get(row)?.owner === id));
    db.prepare("UPDATE techops_users SET role='member' WHERE id=?").run(id);
  }
  response = await call('delete', { method: 'POST', values: { confirm_delete: 'yes' } });
  check('admin can permanently delete a member with business history', response.status === 302 && response.headers.get('location') === '/admin/users?result=deleted' && !account());
  check('deleted member sessions and auth tokens cascade', ['techops_sessions', 'techops_password_resets', 'techops_email_verifications'].every(table => !db.prepare(`SELECT 1 FROM ${table} WHERE user_id=?`).get(id)) && !db.prepare("SELECT 1 FROM techops_login_attempts WHERE username='account-final@hanyangdgtvina.com'").get());
  check('all business rows remain and account references are detached', refs.every(([table,col,row]) => db.prepare(`SELECT ${col} AS owner FROM ${table} WHERE id=?`).get(row)?.owner === null)
    && db.prepare("SELECT imported_by FROM tech_lot_info WHERE lot_id='ACCOUNT-TEST-LOT'").get().imported_by === null);
  check('business content, owner names, and nested values survive deletion', db.prepare('SELECT owner FROM tech_task WHERE id=?').get(taskId).owner === '최종 이름'
    && db.prepare('SELECT content FROM tech_update WHERE id=?').get(updateId).content === '보존 진행'
    && db.prepare('SELECT owner FROM tech_daily_item WHERE id=?').get(dailyId).owner === '최종 이름'
    && db.prepare('SELECT value FROM tech_daily_update_value WHERE update_id=?').get(dailyUpdateId).value === '보존 보고값');
  check('other users and sessions remain intact; no foreign-key violations', !!db.prepare('SELECT 1 FROM techops_users WHERE id=?').get(otherId) && !!db.prepare("SELECT 1 FROM techops_sessions WHERE id='account-other-session'").get() && db.prepare('PRAGMA foreign_key_check').all().length === 0);
  check('repeated delete returns 404', (await call('delete', { method: 'POST', values: { confirm_delete: 'yes' } })).status === 404);
}
