
import worker from "../worker.js";

export async function testNewFeatures({ check, env, db, adminHeaders, viewerHeaders }) {
  const hasMaster = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='tech_master_table'").get();

  // 1. Test Master Data status change (Active vs Inactive)
  if (hasMaster) {
    const masterId = 1;
    const resInactive = await worker.fetch(new Request(`https://x/master/${masterId}/status`, {
      method: "POST",
      headers: { ...adminHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ is_active: "0" })
    }), env, {});
    check("toggle master status returns redirect", resInactive.status === 302);

    const tableInactive = db.prepare("SELECT is_active FROM tech_master_table WHERE id = ?").get(masterId);
    check("master table is_active set to 0", tableInactive?.is_active === 0);

    const resActive = await worker.fetch(new Request(`https://x/master/${masterId}/status`, {
      method: "POST",
      headers: { ...adminHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ is_active: "1" })
    }), env, {});
    check("toggle master status back returns redirect", resActive.status === 302);

    const tableActive = db.prepare("SELECT is_active FROM tech_master_table WHERE id = ?").get(masterId);
    check("master table is_active restored to 1", tableActive?.is_active === 1);
  }

  // 2. Test reordering master field options
  const opt901 = db.prepare("SELECT * FROM tech_daily_field_option WHERE id = 901").get();
  const opt902 = db.prepare("SELECT * FROM tech_daily_field_option WHERE id = 902").get();
  if (opt901 && opt902) {
    const resMove = await worker.fetch(new Request(`https://x/daily-fields/1/options/902/move`, {
      method: "POST",
      headers: { ...adminHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ direction: "up" })
    }), env, {});
    check("option move returns redirect", resMove.status === 302);

    const updated902 = db.prepare("SELECT sort_order FROM tech_daily_field_option WHERE id = 902").get();
    check("option 902 moved up to sort_order 10", updated902?.sort_order === 10);
  }

  // 3. Test Master Data CRUD operations
  if (hasMaster) {
    const masterId = 1;
    const resCreateRow = await worker.fetch(new Request(`https://x/master/${masterId}/rows/new`, {
      method: "POST",
      headers: { ...adminHeaders, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        col_density: "512GB",
        col_status: "ACTIVE"
      })
    }), env, {});
    check("master row create returns redirect", resCreateRow.status === 302);

    const row = db.prepare("SELECT * FROM tech_master_row WHERE table_id = ? ORDER BY id DESC LIMIT 1").get(masterId);
    check("master row inserted with key from is_key field", row?.row_key === "512GB");

    if (row) {
      const resUpdateRow = await worker.fetch(new Request(`https://x/master/${masterId}/rows/${row.id}/edit`, {
        method: "POST",
        headers: { ...adminHeaders, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          col_density: "1TB",
          col_status: "CHECK"
        })
      }), env, {});
      check("master row update returns redirect", resUpdateRow.status === 302);

      const updatedRow = db.prepare("SELECT * FROM tech_master_row WHERE id = ?").get(row.id);
      const data = JSON.parse(updatedRow?.data_json || "{}");
      check("master row data updated to 1TB and status CHECK", data.col_density === "1TB" && data.col_status === "CHECK");

      const resDelete = await worker.fetch(new Request(`https://x/master/${masterId}/rows/${row.id}/delete`, {
        method: "POST",
        headers: adminHeaders
      }), env, {});
      check("master row delete returns redirect", resDelete.status === 302);

      const deletedRow = db.prepare("SELECT * FROM tech_master_row WHERE id = ?").get(row.id);
      check("master row deleted from DB", deletedRow === undefined);
    }
  }

  // 4. Test regular member view & task creation modal
  if (viewerHeaders) {
    const resViewer = await worker.fetch(new Request("https://x/daily-reports", { headers: viewerHeaders }), env, {});
    const htmlViewer = await resViewer.text();
    check("non-admin does not see /daily-items in subtabs", !htmlViewer.includes('href="/daily-items" class='));
    check("non-admin does not see /daily-fields in subtabs", !htmlViewer.includes('href="/daily-fields"'));
    check("daily-reports includes #create-item-dialog modal", htmlViewer.includes('id="create-item-dialog"'));
    check("daily-reports includes cascading select script", htmlViewer.includes('data-depends-on'));
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

  // 6. Test Configurable Item Fields (Department and Category)
  {
    const deptField = db.prepare("SELECT * FROM tech_daily_field WHERE label IN ('소속부서', 'Bộ phận', 'Department')").get();
    const catField = db.prepare("SELECT * FROM tech_daily_field WHERE label IN ('분류', 'Phân loại', 'Category', '업무구분')").get();
    check("Department field exists in tech_daily_field with field_scope=item", deptField?.field_scope === "item" && deptField?.input_type === "select");
    check("Category field exists in tech_daily_field", catField && catField.input_type === "select");

    const deptOptions = deptField ? db.prepare("SELECT value FROM tech_daily_field_option WHERE field_id = ?").all(deptField.id) : [];
    check("Department has SSD and Module options", deptOptions.some(o => o.value === "SSD") && deptOptions.some(o => o.value === "Module"));

    const productField = db.prepare("SELECT * FROM tech_daily_field WHERE label IN ('제품', 'Product')").get();
    if (productField && deptField) {
      check("Product field depends on Department field", productField.depends_on_field_id === deptField.id);
    }
  }
}
