# LOT Tracker

LOT 보고서와 계보 추적을 단일 HTML로 사용하는 도구입니다. 현재 버전은 [v1.2.9](releases/LOT-Tracker-v1.2.9.html)입니다.

## 사용

1. HTML을 브라우저에서 열고 **MES·PMS 파일 추가**로 이력 파일을 넣습니다. 화면 언어는 오른쪽 위 **한국어 / Tiếng Việt**에서 고르며 두 보기에 함께 적용됩니다.
2. **LOT 보고서**에서 **분석 · 보고서 만들기**를 누릅니다.
3. **LOT Tracer Result Excel 다운로드**를 누릅니다.

요청한 v3 Excel 서식은 HTML에 포함되어 있습니다. 사용자가 기준 양식 파일을 선택할 필요가 없습니다. 82개 열의 공정 순서, 변경 이력·실적 열 배치, 머리글, 여백, 열 너비 및 셀 서식을 적용합니다. 원본 양식의 업무 데이터·수식 결과·메모·개인 메타데이터는 포함하지 않습니다.

변경 이력은 이벤트별로 행을 나누고 같은 분석 LOT의 실적은 병합합니다. 각 행의 변경 이력은 그 LOT 이력의 기록을 상대 LOT ID와 함께 표시하고, 분할로 생긴 상세 LOT 행은 `SPLIT <그 LOT> 수량`으로 시작합니다. MERGE QTY의 `+`는 들어온 합병, `-`는 나간 합병이며, 이력의 합병 전·후 수량으로 확인되지 않으면 부호 없이 둡니다. 검증된 SMT 묶음은 한 RUNID로 유지합니다. 확인되지 않은 LOT의 공정 실적이나 관계는 추정하지 않습니다. **계보 추적**에서는 LOT ID로 실행하고 기존 수량 계산을 유지합니다.

CSV/XLS/XLSX 이력 파일은 최대 500개, 파일당 2MB, 합계 128MB입니다. 분석은 이 브라우저 탭에서 실행하며 외부 서버에 업무 파일을 전송하지 않습니다. Excel 및 검증 ZIP은 각 보기에서 저장합니다. 최근 5회 실행은 검증 ZIP에 입력·결과 사본을 포함하며, 더 오래된 실행은 로그만 보관합니다. 저장하지 않은 실행 기록은 HTML을 닫으면 사라집니다.

## 개발

```sh
node lot-tracker/build.mjs
node lot-tracker/test/build.mjs
node lot-tracker/report/engine/test-runid-port.mjs
node lot-tracker/trace/test/test-regression.cjs
node lot-tracker/test/browser.mjs
node lot-tracker/test/template-browser.mjs
```

브라우저 검사는 Playwright 설치 경로를 `PLAYWRIGHT_MODULE`로, 필요한 경우 Chromium 실행 경로를 `CHROMIUM_PATH`로 지정합니다. GitHub의 **LOT Tracker HTML** 워크플로가 단일 HTML을 빌드·검증합니다.

실제 첨부를 확인해 `LOT Tracer Result 20261002.xlsx`는 프로그램 출력, `LOT Tracer Result v3.xlsx`는 요청 양식으로 대조했습니다. 머리글·공정별 열 순서·서식 대조와 전체 업무 데이터의 수량·계보 일치 검증은 구분합니다. 자세한 결과와 남은 확인은 [VERIFICATION.md](VERIFICATION.md)에 기록합니다.
