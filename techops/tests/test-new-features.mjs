import assert from "node:assert/strict";
import worker from "../worker.js";
import { hashPassword } from "../src/utils/helpers.js";

export async function testNewFeatures({ check, env, db, adminHeaders, viewerHeaders }) {
  // 1. Test Đổi mật khẩu
  {
    const { salt, hash } = await hashPassword("OldPass123");
    db.prepare(`
      UPDATE techops_users SET password_hash = ?, password_salt = ? WHERE id = 1
    `).run(hash, salt);

    // 1a. Sai mật khẩu cũ
    const fdWrong = new FormData();
    fdWrong.append("current_password", "WrongPass123");
    fdWrong.append("new_password", "NewPass12345");
    fdWrong.append("confirm_password", "NewPass12345");

    const resWrong = await worker.fetch(new Request("https://x/api/user/change-password", {
      method: "POST",
      headers: adminHeaders,
      body: fdWrong
    }), env, {});
    check("password change fails when current password is wrong", resWrong.status === 400);

    // 1b. Đúng mật khẩu cũ
    const fdRight = new FormData();
    fdRight.append("current_password", "OldPass123");
    fdRight.append("new_password", "NewPass12345");
    fdRight.append("confirm_password", "NewPass12345");

    const resRight = await worker.fetch(new Request("https://x/api/user/change-password", {
      method: "POST",
      headers: adminHeaders,
      body: fdRight
    }), env, {});
    check("password change succeeds when current password is right", resRight.status === 200);
  }

  // 2. Test Sắp xếp Options (Field Option Move)
  {
    db.prepare(`INSERT INTO tech_daily_field (id, label, input_type, sort_order) VALUES (999, 'TestField', 'select', 999)`).run();
    db.prepare(`INSERT INTO tech_daily_field_option (id, field_id, value, sort_order) VALUES (901, 999, 'Opt1', 10), (902, 999, 'Opt2', 20)`).run();

    const fdMove = new FormData();
    fdMove.append("direction", "up");
    const resMove = await worker.fetch(new Request("https://x/daily-fields/999/options/902/move", {
      method: "POST",
      headers: adminHeaders,
      body: fdMove
    }), env, {});
    check("option move returns redirect", resMove.status === 302);

    const opt2 = db.prepare("SELECT sort_order FROM tech_daily_field_option WHERE id = 902").get();
    check("option 902 moved up to sort_order 10", opt2?.sort_order === 10);
  }

  // 3. Test Master Data Row CRUD
  {
    db.prepare(`INSERT INTO tech_master_set (id, code, name_ko, name_en, name_vi, active) VALUES (999, 'SSD_TEST', 'SSD', 'SSD', 'SSD', 1)`).run();
    db.prepare(`INSERT INTO tech_master_field (id, set_id, code, label_ko, label_en, label_vi, data_type, is_key, active) VALUES (901, 999, 'PART_NO', 'Part Number', 'Part Number', 'Part Number', 'TEXT', 1, 1)`).run();
    db.prepare(`INSERT INTO tech_master_field (id, set_id, code, label_ko, label_en, label_vi, data_type, is_key, active) VALUES (902, 999, 'CAPACITY', 'Capacity', 'Capacity', 'Capacity', 'TEXT', 0, 1)`).run();

    // 3a. Thêm row mới
    const fdCreate = new FormData();
    fdCreate.append("field_PART_NO", "MZ-TEST-01");
    fdCreate.append("field_CAPACITY", "512GB");
    fdCreate.append("verify_status", "OK");

    const resCreate = await worker.fetch(new Request("https://x/master/SSD_TEST/row/new", {
      method: "POST",
      headers: adminHeaders,
      body: fdCreate
    }), env, {});
    check("master row create returns redirect", resCreate.status === 302);

    const row = db.prepare("SELECT * FROM tech_master_row WHERE set_id = 999").get();
    check("master row inserted with key from is_key field", row?.row_key === "MZ-TEST-01");

    // 3b. Sửa row
    const fdEdit = new FormData();
    fdEdit.append("field_PART_NO", "MZ-TEST-01");
    fdEdit.append("field_CAPACITY", "1TB");
    fdEdit.append("verify_status", "CHECK");

    const resEdit = await worker.fetch(new Request(`https://x/master/SSD_TEST/row/${row.id}/edit`, {
      method: "POST",
      headers: adminHeaders,
      body: fdEdit
    }), env, {});
    check("master row update returns redirect", resEdit.status === 302);

    const updatedRow = db.prepare("SELECT * FROM tech_master_row WHERE id = ?").get(row.id);
    const updatedData = JSON.parse(updatedRow.data_json);
    check("master row data updated to 1TB and status CHECK", updatedData.CAPACITY === "1TB" && updatedRow.verify_status === "CHECK");

    // 3c. Xóa row
    const resDelete = await worker.fetch(new Request(`https://x/master/SSD_TEST/row/${row.id}/delete`, {
      method: "POST",
      headers: adminHeaders
    }), env, {});
    check("master row delete returns redirect", resDelete.status === 302);

    const deletedRow = db.prepare("SELECT * FROM tech_master_row WHERE id = ?").get(row.id);
    check("master row deleted from DB", deletedRow === undefined);
  }

  // 4. Test regular member view & task creation modal
  if (viewerHeaders) {
    const resViewer = await worker.fetch(new Request("https://x/daily-reports", { headers: viewerHeaders }), env, {});
    const htmlViewer = await resViewer.text();
    check("non-admin does not see /daily-items in subtabs", !htmlViewer.includes('href="/daily-items" class='));
    check("non-admin does not see /daily-fields in subtabs", !htmlViewer.includes('href="/daily-fields"'));
    check("daily-reports includes #create-item-dialog modal", htmlViewer.includes('id="create-item-dialog"'));
  }

  // 5. Test Card Designer & 2 Distinct Field Setting Sections
  {
    const resFields = await worker.fetch(new Request("https://x/daily-fields", { headers: adminHeaders }), env, {});
    const htmlFields = await resFields.text();
    check("daily-fields renders Section 1: Item Creation", htmlFields.includes('id="section-item"'));
    check("daily-fields renders Section 2: Progress Updates", htmlFields.includes('id="section-update"'));
    check("daily-fields renders Section 3: Card Designer", htmlFields.includes('id="card-designer"'));

    const anyField = db.prepare("SELECT id FROM tech_daily_field LIMIT 1").get();
    if (anyField) {
      const fdCard = new FormData();
      fdCard.append(`pos_${anyField.id}`, "highlight");
      const resCardSave = await worker.fetch(new Request("https://x/daily-fields/card-designer", {
        method: "POST",
        headers: adminHeaders,
        body: fdCard
      }), env, {});
      check("card-designer save returns redirect", resCardSave.status === 302 && resCardSave.headers.get("location")?.includes("cardSaved=1"));
      const updatedField = db.prepare("SELECT card_position FROM tech_daily_field WHERE id = ?").get(anyField.id);
      check("card-designer save updates field card_position to highlight", updatedField?.card_position === "highlight");
    }
  }
}
