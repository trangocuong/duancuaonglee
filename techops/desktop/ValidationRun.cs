using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Web.Script.Serialization;

public class ValidationRun {
    public string DirectoryPath { get; private set; }
    public string ArchivePath { get { return DirectoryPath + ".zip"; } }
    readonly string appDirectory;
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = Int32.MaxValue };
    public ValidationRun(string app, string root) {
        appDirectory = app;
        DirectoryPath = Path.Combine(root, DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + "-" + Guid.NewGuid().ToString("N").Substring(0, 8));
        Directory.CreateDirectory(Path.Combine(DirectoryPath, "inputs"));
        Directory.CreateDirectory(Path.Combine(DirectoryPath, "outputs"));
        Directory.CreateDirectory(Path.Combine(DirectoryPath, "logs"));
        File.WriteAllText(Path.Combine(DirectoryPath, "app-version.json"), AppRelease.Json, new UTF8Encoding(false));
        Log("RUN_CREATED", "Version=" + AppRelease.Version + "; BuiltAt=" + AppRelease.BuiltAt + "; App=" + app + "; OS=" + Environment.OSVersion + "; CLR=" + Environment.Version);
    }
    public void Log(string stage, string detail) {
        File.AppendAllText(Path.Combine(DirectoryPath, "logs", "app.log"), DateTimeOffset.Now.ToString("o") + " [" + stage + "] " + detail + Environment.NewLine, new UTF8Encoding(false));
    }
    public string Execute(string[] files) {
        try {
            File.WriteAllText(Path.Combine(DirectoryPath, "request.json"), json.Serialize(new { appVersion = AppRelease.Version, startedAt = DateTimeOffset.Now.ToString("o"), files = files }), new UTF8Encoding(false));
            var copies = new List<string>();
            var failures = new List<string>();
            for (int i = 0; i < files.Length; i++) {
                try {
                    string folder = Path.Combine(DirectoryPath, "inputs", (i + 1).ToString("D3"));
                    Directory.CreateDirectory(folder);
                    string target = Path.Combine(folder, Path.GetFileName(files[i]));
                    File.Copy(files[i], target);
                    copies.Add(target);
                    Log("INPUT_COPIED", files[i] + " -> " + target);
                } catch (Exception error) { failures.Add(files[i] + ": " + error.Message); Log("INPUT_COPY_FAILED", error.ToString()); }
            }
            if (failures.Count > 0) throw new IOException(String.Join(Environment.NewLine, failures));
            string request = json.Serialize(new { files = copies, output = Path.Combine(DirectoryPath, "outputs"), logDirectory = Path.Combine(DirectoryPath, "logs") });
            var info = new ProcessStartInfo(Path.Combine(appDirectory, "runtime", "node.exe"), "--permission --allow-fs-read=* --allow-fs-write=\"" + DirectoryPath + "\" \"" + Path.Combine(appDirectory, "analyze.mjs") + "\"") {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
            };
            Log("ENGINE_START", "InputCount=" + copies.Count);
            using (var process = Process.Start(info)) {
                var outputTask = process.StandardOutput.ReadToEndAsync();
                var errorTask = process.StandardError.ReadToEndAsync();
                byte[] data = new UTF8Encoding(false).GetBytes(request);
                process.StandardInput.BaseStream.Write(data, 0, data.Length);
                process.StandardInput.Close();
                bool timedOut = !process.WaitForExit(180000);
                if (timedOut) { process.Kill(); process.WaitForExit(); }
                File.WriteAllText(Path.Combine(DirectoryPath, "logs", "engine-stderr.log"), errorTask.Result, new UTF8Encoding(false));
                File.WriteAllText(Path.Combine(DirectoryPath, "outputs", "result.json"), outputTask.Result, new UTF8Encoding(false));
                Log("ENGINE_EXIT", "ExitCode=" + process.ExitCode + "; TimedOut=" + timedOut);
                if (timedOut) throw new TimeoutException("분석 시간이 3분을 초과했습니다.");
                if (process.ExitCode != 0) throw new Exception(errorTask.Result);
                return outputTask.Result;
            }
        } catch (Exception error) { Log("ANALYSIS_FAILED", error.ToString()); throw; }
    }
    public void Archive(string outcome) {
        Log("ARCHIVE_START", outcome);
        File.WriteAllText(Path.Combine(DirectoryPath, "status.json"), json.Serialize(new { appVersion = AppRelease.Version, outcome = outcome, updatedAt = DateTimeOffset.Now.ToString("o") }), new UTF8Encoding(false));
        string pending = ArchivePath + ".pending-" + Guid.NewGuid().ToString("N");
        try {
            ZipFile.CreateFromDirectory(DirectoryPath, pending, CompressionLevel.Optimal, false, Encoding.UTF8);
            if (File.Exists(ArchivePath)) File.Replace(pending, ArchivePath, null);
            else File.Move(pending, ArchivePath);
        } catch (Exception error) {
            Log("ARCHIVE_FAILED", error.ToString());
            throw new IOException("ZIP 저장 실패. 원본 검증 폴더는 보존되었습니다: " + DirectoryPath, error);
        }
    }
}
