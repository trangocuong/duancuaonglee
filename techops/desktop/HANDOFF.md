# LOT Tracker 오프라인 앱 개발 인수인계

이 문서와 저장소만으로 새 PC 또는 다른 개발 대화에서 작업을 이어갈 수 있습니다. 최초 보관일은 2026-09-22이며, 현재 사용자 배포 버전은 **1.0.3**입니다. [개발 이력](CHANGELOG.md), [버전 원본](release.json), [사용 안내](README.txt)를 함께 읽으세요.

별도 세션에서 전달된 단일 HTML 앱도 같은 브랜치에 통합했습니다. 해당 앱은 [offline-web/HANDOFF.md](offline-web/HANDOFF.md)를 읽으세요. 실행 형식과 ZIP 보관 방식, 버전 원본이 서로 다릅니다.

## 현재 상태와 보관 범위

- Windows 10/11 x64, .NET Framework 4.5 이상에서 동작하는 WinForms 앱입니다. Node.js 24.20.0 x64와 SheetJS 0.20.3을 배포 ZIP에 포함합니다.
- 브라우저, HTTP 서버, 인터넷, 로그인, Excel 설치가 필요 없습니다. 파일 분석 엔진은 Node permission 모드로 실행하며 네트워크 권한을 부여하지 않습니다.
- CSV/XLS/XLSX See LOT 파일을 분석해 전체 공정, 이력, 불량, 후속 LOT, SMT RUNID 후보, SPLIT LOT, 추가 파일 요청을 보여줍니다.
- 입력은 최대 500개, 파일당 2MB, 합계 128MB입니다. 엔진 시간 제한은 3분입니다. 500개 최대 부하 검증은 아직 하지 않았습니다.
- 두 가지 Excel을 만듭니다. 기본 공정별 보고서는 SMT부터 표시하고 기존 고정 양식은 M121/M130부터 시작하는 비교용입니다.
- 매 실행의 입력 복사본, 결과, 상세 로그, 버전을 앱 폴더의 `validation-runs/<시각-고유번호>/`와 같은 이름의 ZIP에 보관합니다. 실패한 실행도 확보된 자료를 보존합니다.
- 원본 업무 파일, 내부망 경로, 실제 검증 ZIP, 인증 정보는 이 저장소에 포함하지 않습니다. 자동 테스트는 가상 데이터로 재현됩니다.

## 웹 버전과 로컬 버전은 분리되어 있습니다

이 브랜치는 웹 `main`의 `3c95a83`에서 분기했습니다. 루트의 웹 버전은 1.6.7이며, 로컬 앱 1.0.0과 번호 체계가 다릅니다.

로컬에서 검증한 분석 코드를 `desktop/engine/`에 동결해 보관했습니다. 빌드는 이 두 파일을 사용하며 **루트의 동명 웹 파일을 사용하지 않습니다.** 이후 웹에는 RUNID CSV 연결 등 다른 변경이 진행되어 있어, 최신 웹 엔진으로 교체하면 사용자 검증 결과가 달라질 수 있습니다. 동기화할 때는 두 엔진을 비교하고 별도 버전 및 회귀 테스트를 남기세요.

`main` push는 기존 Cloudflare 운영 자동배포를 시작합니다. 데스크톱 보관 PR은 웹 배포 승인을 뜻하지 않습니다. 이 PR은 데스크톱 자료와 문서만 추가하고 루트 웹 코드를 변경하지 않습니다.

## 새 환경에서 개발 시작

온라인 개발용 Windows PC에 Git, Node.js **24.20.0 x64**, pnpm(package.json 지정 버전)을 준비합니다. 내부망 실행 PC는 개발 도구가 필요 없습니다. 포함된 Node 라이선스도 24.20.0 기준이므로 런타임을 바꿀 때 함께 갱신합니다.

```powershell
git clone https://github.com/SBRGOM/techops.git
cd techops
git switch codex/lot-tracker-offline-handoff
corepack enable
corepack pnpm install --frozen-lockfile
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build.ps1
node desktop/test-offline.mjs
node desktop/test-tracking.mjs
node desktop/test-run-maps.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/test-validation.ps1
powershell -NoProfile -Sta -ExecutionPolicy Bypass -File desktop/test-version.ps1
node test.mjs
```

브랜치가 병합되어 삭제됐다면 `main`에서 `desktop/HANDOFF.md`가 존재하는지 확인하고 새 `codex/` 작업 브랜치를 만드세요. GitHub PR 및 커밋 기록에도 인수인계 시점이 남습니다.

결과는 `outputs/LOT-Tracker-Offline-v<version>-Windows-x64.zip`입니다. 전체 압축 해제 후 `LOT Tracker.exe`를 실행합니다. 빌드는 허용된 프로그램 파일만 별도 폴더에 복사해 압축하므로, 기존 앱 폴더에서 수집된 `validation-runs`가 배포 ZIP에 섞이지 않습니다.

## 코드 위치

| 파일 | 역할 |
| --- | --- |
| `LotTracker.cs` | 파일 선택, 결과 표, 파일 추가, ID 복사, 저장 및 버전 창 |
| `ValidationRun.cs` | 입력 복사, 엔진 실행, 오류 수집, ZIP 저장 |
| `analyze.mjs` | 파일 검증, 분석, Excel 생성, 단계별 로그 |
| `tracking.mjs` | RUNID 후보, SPLIT LOT 목록 및 누락 파일 요청 |
| `run-maps.mjs` | 다중 병합 RUNID 맵의 직접/경유 연결, 품번 근거와 확인 사항 |
| `engine/lot-tracker.js` | 로컬 검증 기준 파서, LOT 연결 및 고정 보고서 |
| `engine/lot-step-report.js` | 공정 순서, 취소 제외, 차수별 실적, 후속 LOT |
| `release.json`, `AppRelease.cs` | 버전과 변경 이력 원본 및 앱 표시 |
| `build.ps1` | 버전 내장, 런타임 포함, 허용 파일만 패키징 |

## 검증 및 알려진 제한

- 인수인계 전 로컬 웹 기준 테스트 356개 통과. 이는 동결된 로컬 작업 시점의 결과이며 최신 웹 main 테스트 수와 구분합니다.
- 인수인계 브랜치의 최신 웹 main 기준 테스트는 343개 통과했습니다. 별도 작업 공간에서 앱 빌드와 모든 desktop 자동 테스트도 통과했습니다. 1.0.1 커밋의 GitHub Windows Actions에서도 새 의존성 설치부터 전체 테스트까지 성공했습니다.
- 사용자 제공 41개 파일의 오프라인 분석과 보고서 생성 확인. 모든 관측 공정이 SMT부터 순서대로 표시되는 것을 확인했습니다. 업무 계산 전체에 대한 승인이나 최대 용량 검증을 의미하지 않습니다.
- 자동 테스트: 정상 분석, 오류/중복/빈 입력/용량 초과, 추적 파일 포함에 따른 누락 목록 갱신, 파일 누락, 엔진 실행 실패, ZIP 갱신·잠금 실패 시 보존, 버전 정보 확인.
- 맵이 없으면 M010에서 단일 Split의 QTY와 변경 수량이 같은 상위 ID는 **후보**입니다. 1.0.1부터 제공된 RUNID 맵의 LOT_ID·SPLIT_LOT·MERGE_LOT과 이벤트의 시작 Split으로 직접/경유 연결을 별도 확인합니다. 연결이 없거나 품번이 상충하면 추정하지 않습니다.
- SPLIT 방향 판단은 기존 휴리스틱에 의존합니다. 복수 분할·병합·재작업·전량 분할의 애매한 사례에는 추가 원본이 필요합니다. 파일에 없는 관계를 완전한 계보로 단정하지 마세요.
- 1.0.1은 19열 PCB/RUNID 맵을 CSV/XLS/XLSX로 읽고 다중 병합을 지원합니다. 웹의 축약 RUNID CSV 파서는 그대로 이식하지 않았으므로 다른 열 구성은 별도 호환성 검증이 필요합니다.
- PART NO는 연결 근거가 확인된 맵의 PROD_ID가 하나일 때만 채웁니다. 맵 행 수/PCB_ARRAY는 공정 수량이 아니며 분할 맵 전체 형제 LOT을 추가 요청 목록으로 무조건 확장하지 않습니다.
- 강제 종료·전원 차단 시 ZIP이 완성되지 않을 수 있으며 작성된 폴더/로그는 남습니다. 자동 복구·보관 기간 관리·코드 서명·자동 업데이트는 없습니다.
- UI 대화상자의 실제 사용자 클릭 흐름과 대량 파일의 반응성은 내부망 PC에서 추가 확인합니다.

## 문제 재현과 다음 작업

1. 실행 버전, 증상, 기대값과 실제값, LOT/공정, 해당 검증 ZIP을 확보합니다. 공유는 사내 규정을 따릅니다.
2. ZIP의 `app-version.json`, `status.json`, `logs/app.log`, `logs/analysis.jsonl`, `logs/engine-stderr.log`부터 확인합니다. 원본을 덮어쓰지 않습니다.
3. 검증 ZIP을 Git 추적 대상 밖의 `outputs/`에 풀고 필요하면 `LOT_TRACKER_REVIEW_DIR` 환경변수로 해당 회차 폴더를 지정해 `node desktop/test-tracking.mjs`를 실행합니다. 업무 자료는 커밋하지 않습니다.
4. 재현 가능한 최소 가상 파일을 테스트에 추가합니다. 수정 후 `release.json` 버전을 올리고 `CHANGELOG.md`에 이유·동작·검증·미해결 사항을 기록합니다.
5. 현재 분석 결과가 기준인 `desktop/engine`을 수정하거나 웹 엔진 기능을 검토해 이식합니다. 웹과 로컬을 섞어 덮어쓰지 않습니다.
6. 자동 테스트와 앱 화면을 확인하고 버전 ZIP을 배포합니다. PR에 검증 결과를 기록하고 다음 담당자가 이해할 수 있도록 이 문서를 갱신합니다.

## 대화를 잃었을 때 전달할 문장

> SBRGOM/techops 저장소의 codex/lot-tracker-offline-handoff 브랜치(병합됐다면 main)에서 desktop/HANDOFF.md와 desktop/CHANGELOG.md를 먼저 읽고 LOT Tracker Offline 개발을 이어가 주세요. 현재 배포 기준은 1.0.1이고 분석 엔진은 desktop/engine에 별도로 보관되어 있습니다. 운영 웹 배포와 분리하여 작업하고, 새 검증 ZIP의 버전과 로그로 문제를 재현해 주세요.

## 로컬 재검증 업데이트 1.0.3

LOTID 번호 추정 제거를 유지하면서 상호 Split 이벤트로 UUID 부모를 복원하고, 이벤트 수량 흐름으로 Merge 유입·유출을 구분한다. 생성 Split은 후속 자식 Split에서 제외하며, 근거가 부족한 Merge는 확인 필요로 표시한다. 자리 규칙은 desktop/LOT-RULES.md, SQL 입력 경계는 desktop/INPUT-CONTRACT.md 참고. `node desktop/test-lot-rules.mjs`로 두 엔진의 규칙을 함께 검증한다. SQL 접속은 미구현이다.
