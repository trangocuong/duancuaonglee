using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

public static class AppRelease {
    public static readonly string Json;
    public static readonly string Version;
    public static readonly string BuiltAt;
    public static readonly string ChangeHistory;
    static AppRelease() {
        using (var reader = new StreamReader(typeof(AppRelease).Assembly.GetManifestResourceStream("release.json"), Encoding.UTF8)) Json = reader.ReadToEnd();
        var release = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(Json);
        Version = (string)release["version"];
        BuiltAt = (string)release["builtAt"];
        var text = new StringBuilder("LOT Tracker Offline v" + Version + "\r\n배포일: " + release["releasedAt"] + "\r\n빌드 시각 (UTC): " + BuiltAt + "\r\n\r\n이번 버전 변경 내역\r\n");
        foreach (string change in (ArrayList)release["changes"]) text.AppendLine("• " + change);
        text.AppendLine("\r\n이전 변경 내역");
        foreach (string change in (ArrayList)release["previousChanges"]) text.AppendLine("• " + change);
        ChangeHistory = text.ToString();
    }
}
