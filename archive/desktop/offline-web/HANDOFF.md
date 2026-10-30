# LOT Tracker Offline Web 인수인계

현재 HTML 앱 버전은 **1.0.6**입니다. Windows 실행 파일과는 별도 제품 형식이며 버전은 이 폴더의 `release.json`에서 관리합니다. WinForms는 `../HANDOFF.md`를 참고합니다. 운영 Cloudflare 웹앱과도 다릅니다.

## 도입 배경과 출처

인터넷 없는 생산현장에서 쓰는 WinForms 앱이 먼저 존재했습니다. 사용자 전달 설명에 따르면 이후 Linux 기반 Cowork 작업에서 실행 검증 가능한 형태로 바꾸는 승인을 받아 단일 HTML 앱을 만들었습니다. 이 저장소에는 제공받은 `offline-web-source.zip`을 검토해 통합했습니다. 원본 ZIP SHA-256은 `43279392de13142f191e2de058126b454de5a2dab5d514a7b7012652ccbc0403`입니다.

원본에서 WinForms `LotTracker.cs`와 `README.txt`는 오래된 1.0.0 기준이므로 통째로 덮어쓰지 않았습니다. PART NO 안내 취지는 이미 수정된 WinForms 1.0.1에 반영돼 있습니다. 별도 `claude/lot-tracker-offline-web-handoff.md` 원본은 ZIP에 없어서, 전달받은 배경과 검증된 현황을 이 문서에 기록했습니다.

## 사용

`dist/LOT-Tracker-Offline-Web-v1.0.6.html` 한 파일을 내부망 PC로 복사하고 Chrome/Edge에서 열면 됩니다. 웹 서버, 인터넷, Node 설치가 필요 없습니다. 파일 입력과 다운로드가 허용된 브라우저가 필요합니다.

See LOT 파일과 RUNID 파일을 선택하고 분석합니다. RUNID 파일은 `LOT_ID`, `PROD_ID`, `MERGE_LOT` 열을 포함한 CSV/XLS/XLSX를 지원합니다. 이벤트의 시작 Split과 직접/경유 연결이 확인된 경우만 품번을 연결합니다. UUID 이름의 이벤트 파일은 M010 투입 발행·종료, 전체 Split 수량, 자식 LOT 계열이 모두 일치할 때만 5~7자리를 `000`으로 바꾼 SMT 투입 RUN ID로 인식하고 PMS 정보를 요청합니다. 맵을 공정 실적으로 합산하지 않으며, 다른 근거 없는 상위 ID는 후보로 남깁니다. 현장의 SMT RUNID 업무 판정 규칙 전체가 확정된 것은 아닙니다.

분석 후 첫 탭과 Excel 첫 시트에서 `LOT 공정표`를 확인합니다. 이 표는 M010-M015·M033과 SPLIT LOT별 M050·M055 1/2차·M060을 고정 열로 묶습니다. 2D 바코드 맵에 값이 있으면 FAB·TIER·OPT와 PCB_ARRAY 합계도 표시합니다. 관측된 공정을 체크박스로 선택하는 기존 동적 보고서도 다음 탭과 같은 Excel에 유지됩니다. 1.0.3에서 제거한 M121 시작 구형 고정양식은 다시 추가하지 않았습니다.

결과는 브라우저 메모리에만 있습니다. Excel 또는 `검증결과.zip`을 내려받아야 보존됩니다. **WinForms의 자동 폴더·ZIP 저장과 달리 HTML 앱은 사용자가 다운로드 버튼을 눌러야 합니다.** 일반 file:// 웹페이지에는 임의 폴더에 자동으로 쓰는 권한이 없습니다.

## 검증 ZIP 범위

- 이번 탭의 전체 실행에 대해 시간, 상태, 파일명·SHA-256, 단계별 로그를 보관합니다.
- 최근 5회에는 읽기에 성공한 입력 사본과 생성된 Excel/summaries.json도 포함합니다. 그 이전 회차는 로그만 유지하고 원본·결과는 정리합니다.
- 실패한 입력 이후 아직 읽지 못한 파일이나 크기 제한으로 읽지 않은 파일의 사본은 없을 수 있습니다. 오류 ZIP만으로 모든 실패를 재현할 수 있다고 단정하지 마세요.
- 탭 닫기·새로고침·브라우저 종료 시 다운로드하지 않은 기록은 사라집니다. 분석 전부를 영구 자동 보관하려면 WinForms 앱을 사용하세요.
- 최대 500개/파일당 2MB/총 128MB 제한은 유지하지만 최대 부하와 메모리 상한은 아직 시험하지 않았습니다.

## 빌드와 검증

빌드 자체는 Node.js 외에 의존성이 없으며 네트워크에 접속하지 않습니다.

```sh
node desktop/offline-web/build/build.mjs
node desktop/offline-web/test-build.mjs
```

`release.json`의 버전과 배포일을 사용하므로 같은 소스는 바이트 단위로 같은 HTML을 만듭니다. 원본 1.0.0 빌드는 실행 시각만 달랐으며 이것을 수정했습니다. 파일 줄바꿈은 `.gitattributes`로 LF로 고정합니다.

엔진 단위 테스트는 루트의 pnpm 의존성을 설치한 후 실행합니다. E2E에는 Playwright와 Chromium이 개발 환경에만 필요합니다.

```sh
corepack pnpm install --frozen-lockfile
node desktop/offline-web/engine/test-runid-port.mjs
npm install --prefix outputs/browser-tests --no-save playwright@1.62.1
node outputs/browser-tests/node_modules/playwright/cli.js install chromium
# PLAYWRIGHT_MODULE을 outputs/browser-tests/node_modules/playwright/index.mjs의 절대 file:// URL로 지정
node desktop/offline-web/test-e2e.mjs
```

선택 설정: `PLAYWRIGHT_EXECUTABLE`은 이미 설치된 Chrome/Chromium 실행 파일 경로입니다. `LOT_TRACKER_REVIEW_DIR`을 사내 검증 회차 폴더(`inputs/001/...` 구조)로 지정하면 E2E 마지막에 추가 재생합니다. 실제 자료는 항상 Git 밖의 `outputs/`에 두세요. 워크플로 `.github/workflows/offline-web.yml`에도 전체 실행 예제가 있습니다.

검증된 범위: 직접/간접 RUNID 연결, M010 SMT 투입 RUN ID와 PMS 요청, 다중 병합 XLS, 정상·오류·오류 후 이전 보고서 다운로드 차단, SHA-256 대조, Excel/ZIP 내용 검사, 8회 실행 후 최근 5회 보관, file:// 브라우저의 외부 네트워크 요청 없음. 제공된 실파일 재생도 별도로 수행하되 실제 파일은 Git에 포함하지 않습니다. 이는 업무 수량 전체의 승인이나 모든 브라우저 보장을 의미하지 않습니다.

## 의존성과 다음 변경

- SheetJS는 원본 0.18.5에서 루트에 잠긴 **0.20.3**의 `dist/xlsx.full.min.js`로 교체했습니다. 빌드 시 다운로드하지 않습니다.
- JSZip 3.10.1 및 자체 SHA-256 코드는 제공된 소스를 유지합니다. 라이선스는 vendor/에 함께 보관합니다.
- UI: `build/app.js`, 문서 뼈대: `build/page-shell.html`, 엔진: `engine/`. WinForms 엔진과 루트 웹 엔진을 자동 동기화하지 않습니다.
- 다음 배포마다 이 폴더의 `release.json`과 CHANGELOG.md를 갱신하고 재빌드/테스트하세요. `dist/`의 HTML은 사용자 요청에 따라 배포용으로 커밋합니다. 검증 ZIP·스크린샷·실제 업무 파일은 커밋하지 않습니다.
- codex/ 브랜치에 커밋하고 PR에서 이어갑니다. main 병합은 운영 웹 배포를 유발하므로 HTML 자료 보관을 운영 배포 승인으로 취급하지 마세요.

## 로컬 재검증 업데이트 1.0.4

LOTID 번호 추정 제거를 유지하면서 상호 Split 이벤트로 UUID 부모를 복원하고, 이벤트 수량 흐름으로 Merge 유입·유출을 구분한다. 생성 Split은 후속 자식 Split에서 제외하며, 근거가 부족한 Merge는 확인 필요로 표시한다. 자리 규칙은 desktop/LOT-RULES.md, SQL 입력 경계는 desktop/INPUT-CONTRACT.md 참고. `node desktop/test-lot-rules.mjs`로 두 엔진의 규칙을 함께 검증한다. SQL 접속은 미구현이다.

## LOT 공정표 업데이트 1.0.5

검증 ZIP의 원본 4개를 재생해 H094010639을 원 LOT 첫 행, H0945M0639을 SPLIT LOT 후속 행으로 배치했다. 사용자 제공 표와 FAB B·TIER 0·OPT 1, 1,200 수량, M033/M050/M055/M060 장비·수량·불량·수율을 셀 단위로 대조했다. 실제 파일과 검증 ZIP은 Git에 포함하지 않는다.

## SMT 투입 RUN ID 업데이트 1.0.6

M010 `ISSUE_VMS1_VMDL` 수량과 종료 전 전체 Split 수량이 같고 모든 자식 LOT의 앞 4자리·뒤 3자리가 일치하는 UUID 파일은 5~7자리를 `000`으로 치환한 SMT 투입 RUN ID로 인식한다. 해당 RUN ID의 PART NO·FAB·TIER·OPT·투입수량을 PMS에서 확인하도록 한 건만 요청하고, 자식 LOT 전체를 자동으로 추가 요청하지 않는다. PMS 직접 연동은 구현하지 않았으며 정보 파일을 추가한 뒤 재분석하는 흐름이다.
