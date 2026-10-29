using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class LotTracker : Form {
    Button select = new Button { Text = "See LOT 파일 선택 · 분석", AutoSize = true };
    Button save = new Button { Text = "Excel 보고서 저장", AutoSize = true, Enabled = false };
    Label status = new Label { Text = "파일을 선택하세요. CSV / XLS / XLSX · 최대 500개", AutoSize = true, Padding = new Padding(8) };
    TabControl tabs = new TabControl { Dock = DockStyle.Fill };
    ValidationRun run;
    string runOutcome;
    Button history = new Button { Text = "검증 기록 폴더", AutoSize = true };
    Button versionInfo = new Button { Text = "버전 / 변경 내역", AutoSize = true };
    Button addFiles = new Button { Text = "추적 파일 추가 · 재분석", AutoSize = true, Enabled = false };
    Button copyIds = new Button { Text = "추가조회 ID 복사", AutoSize = true, Enabled = false };
    string[] includedFiles = new string[0];
    string[] missingIds = new string[0];
    string[] exports;
    bool busy;
    JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = Int32.MaxValue };

    [STAThread] static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new LotTracker());
    }
    LotTracker() {
        Text = "LOT Tracker v" + AppRelease.Version + " · 오프라인"; Width = 1400; Height = 850;
        MinimumSize = new Size(900, 550); Font = new Font("맑은 고딕", 10);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 100, Padding = new Padding(8) };
        bar.Controls.AddRange(new Control[] { select, addFiles, copyIds, save, history, versionInfo, status });
        var note = new Label { Dock = DockStyle.Bottom, Height = 52, Padding = new Padding(8), Text = "오프라인 파일 분석 · 인터넷 / 로그인 / Excel 설치 불필요\nPART NO는 원본 연결이 확인된 RUNID 맵에서 표시합니다. SWP 직접 조회는 지원하지 않습니다." };
        Controls.Add(tabs); Controls.Add(bar); Controls.Add(note);
        note.Text = "v" + AppRelease.Version + " · " + note.Text;
        versionInfo.Click += delegate {
            using (var info = new Form { Text = "LOT Tracker · 버전 / 변경 내역", Size = new Size(780, 490), StartPosition = FormStartPosition.CenterParent, Font = Font }) {
                info.Controls.Add(new TextBox { Multiline = true, ReadOnly = true, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical, Text = AppRelease.ChangeHistory });
                info.ShowDialog(this);
            }
        };
        select.Click += delegate { SelectFiles(false); };
        addFiles.Click += delegate { SelectFiles(true); };
        copyIds.Click += delegate { try { Clipboard.SetText(String.Join(Environment.NewLine, missingIds)); } catch (Exception error) { MessageBox.Show(error.Message); } };
        save.Click += delegate { SaveReports(); };
        history.Click += delegate {
            try {
                string root = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "validation-runs");
                Directory.CreateDirectory(root);
                Process.Start(new ProcessStartInfo(root) { UseShellExecute = true });
            } catch (Exception error) { MessageBox.Show(error.Message); }
        };
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) e.Cancel = true; };
    }
    void SelectFiles(bool append) {
        using (var dialog = new OpenFileDialog { Filter = "See LOT 파일|*.csv;*.xls;*.xlsx", Multiselect = true }) {
            if (dialog.ShowDialog() != DialogResult.OK) return;
            var chosen = new List<string>();
            if (append) foreach (string file in includedFiles) {
                if (!Array.Exists(dialog.FileNames, candidate => String.Equals(Path.GetFileName(candidate), Path.GetFileName(file), StringComparison.OrdinalIgnoreCase))) chosen.Add(file);
            }
            chosen.AddRange(dialog.FileNames);
            string[] files = chosen.ToArray();
            try {
                run = new ValidationRun(AppDomain.CurrentDomain.BaseDirectory, Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "validation-runs"));
            } catch (Exception error) {
                MessageBox.Show("검증 기록 폴더를 만들 수 없습니다. 앱 폴더의 쓰기 권한을 확인하세요.\n" + error.Message);
                return;
            }
            busy = true; select.Enabled = false; save.Enabled = false; addFiles.Enabled = false; copyIds.Enabled = false;
            tabs.TabPages.Clear(); status.Text = "분석 중…";
            var worker = new BackgroundWorker();
            worker.DoWork += delegate(object sender, DoWorkEventArgs e) {
                e.Result = run.Execute(files);
            };
            worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs e) {
                runOutcome = "failed";
                try {
                    if (e.Error != null) throw e.Error;
                    var result = json.Deserialize<Dictionary<string, object>>((string)e.Result);
                    var exportList = (ArrayList)result["exports"];
                    exports = new string[exportList.Count]; exportList.CopyTo(exports);
                    foreach (Dictionary<string, object> tab in (ArrayList)result["tabs"]) {
                        var page = new TabPage((string)tab["name"]);
                        var grid = new DataGridView { Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None, RowHeadersVisible = false, BackgroundColor = Color.White, ClipboardCopyMode = DataGridViewClipboardCopyMode.EnableWithoutHeaderText };
                        var rows = (ArrayList)tab["rows"];
                        int width = 0; foreach (ArrayList row in rows) width = Math.Max(width, row.Count);
                        for (int i = 0; i < width; i++) grid.Columns.Add("c" + i, "");
                        grid.ColumnHeadersVisible = false;
                        foreach (DataGridViewColumn column in grid.Columns) { column.Width = 140; column.SortMode = DataGridViewColumnSortMode.NotSortable; }
                        foreach (ArrayList row in rows) grid.Rows.Add(row.ToArray());
                        int headers = Convert.ToInt32(tab["headerRows"]);
                        for (int i = 0; i < Math.Min(headers, grid.Rows.Count); i++) { grid.Rows[i].Frozen = true; grid.Rows[i].DefaultCellStyle.BackColor = Color.LightSteelBlue; }
                        page.Controls.Add(grid); tabs.TabPages.Add(page);
                    }
                    includedFiles = Directory.GetFiles(Path.Combine(run.DirectoryPath, "inputs"), "*", SearchOption.AllDirectories);
                    var missingList = (ArrayList)result["missingIds"];
                    missingIds = new string[missingList.Count]; missingList.CopyTo(missingIds);
                    addFiles.Enabled = true; copyIds.Enabled = missingIds.Length > 0;
                    run.Log("UI_RENDERED", "Tabs=" + tabs.TabPages.Count);
                    runOutcome = "success";
                    status.Text = result["count"] + " 이벤트 LOT · RUNID 맵 " + result["mapCount"] + "개 · 추가조회 " + missingIds.Length + "개"; save.Enabled = true;
                } catch (Exception error) {
                    status.Text = "분석 실패";
                    try { run.Log("UI_OR_ANALYSIS_FAILED", error.ToString()); } catch { }
                    MessageBox.Show(error.Message + "\n검증 기록: " + run.DirectoryPath, "LOT Tracker", MessageBoxButtons.OK, MessageBoxIcon.Error);
                } finally {
                    try { run.Archive(runOutcome); status.Text += " · ZIP 자동 보관 완료"; }
                    catch (Exception error) { MessageBox.Show(error.ToString(), "검증 기록 압축 실패"); }
                    busy = false; select.Enabled = true;
                    if (runOutcome == "success" && missingIds.Length > 0) {
                        var answer = MessageBox.Show("SMT RUNID 후보 / SPLIT LOT 중 " + missingIds.Length + "개 ID의 See LOT 파일이 필요합니다.\n추가 파일 요청 탭에서 목록을 확인하고 ID 복사 버튼으로 조회하세요.\n준비된 파일을 지금 추가하시겠습니까?", "추적 파일 포함 요청", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                        if (answer == DialogResult.Yes) BeginInvoke(new Action(delegate { SelectFiles(true); }));
                    }
                }
            };
            worker.RunWorkerAsync();
        }
    }
    void SaveReports() {
        using (var dialog = new FolderBrowserDialog { Description = "보고서를 저장할 폴더를 선택하세요." }) {
            if (dialog.ShowDialog() != DialogResult.OK) return;
            try {
                string destination = Path.Combine(dialog.SelectedPath, "LOT-Reports-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 6));
                Directory.CreateDirectory(destination);
                foreach (string file in exports) File.Copy(file, Path.Combine(destination, Path.GetFileName(file)));
                run.Log("REPORTS_EXPORTED", destination);
                run.Archive(runOutcome);
                MessageBox.Show("보고서 2개 저장 완료\n" + destination);
            } catch (Exception error) {
                try { run.Log("REPORT_EXPORT_FAILED", error.ToString()); run.Archive(runOutcome); } catch { }
                MessageBox.Show(error.Message, "저장 실패");
            }
        }
    }
}
