# 개발 현황 — 2026-10-05 (UTC)

| 제품 | 버전 | 기준 |
|---|---|---|
| 업무관리 웹 | 1.7.7 | package.json, worker.js, 루트 LOT 모듈 |
| LOT Tracker HTML | 1.2.9 (integration-preview) | lot-tracker/release.json, `lot-tracker/releases/LOT-Tracker-v1.2.9.html` |

LOT Tracker는 PR #8(2026-10-04 main 병합)부터 `lot-tracker/`의 단일 HTML 한 제품으로 관리한다(LOT 보고서 + 계보 추적). Windows 1.0.3과 Offline HTML 1.0.6(`desktop/`)은 비교용 과거 자료이며 새 릴리스를 만들지 않는다. 웹 `/lot-tracker` 화면(루트 `lot-tracker.js`)은 별도로 유지한다.

main push는 Cloudflare 운영 자동배포다. 운영 반영은 `/api/version`으로 확인한다.

## 평가관리 운영 반영 준비

- Q-EVAL v75 화면 7개와 등록·수정·공정 이력·신제품·대량 보고·Excel·통계·권한 API를 `/tasks`에 이식했다. 기존 일반 업무는 `/tasks/legacy`에서 유지한다.
- 최신 운영 v1.6.11의 디자인·일일보고·LOT 변경을 보존한다. 기존 사이트 계정/세션과 DB/AI/CF_VERSION_METADATA 바인딩을 유지한다.
- 사용자 요청으로 평가 전용 테이블 5개 추가 및 운영 배포를 승인받았다. 기존 데이터 테이블을 수정/삭제하지 않는다. 배포 전 Worker 버전과 D1 복구 지점을 보관한다.
- 이전 이식 단계에서 평가 검증 29개 및 기존 검증 353개를 통과했다. 최신 main 통합 후 검증·운영 확인 결과는 배포 기록에 남긴다.
- 최신 main 통합 후 평가 29개·기존 웹 362개 및 dry-run을 통과했다. 2026-09-30 운영 v1.7.0 배포와 평가 테이블 추가를 완료했다. `/api/version` 및 로그인 화면에서 `667384df-f140-46dd-8abf-5afd77c79edd`를 확인했다. 운영 합성 데이터 입력과 main 변경은 하지 않았다. 상세 검증·롤백 정보는 `docs/EVALUATION-DEPLOYMENT.md`를 참조한다.

## 최근 변경

- LOT Tracker HTML 1.2.9 수율 자릿수 (2026-10-05 main 반영·운영 배포): 수율 100% 이상은 소수점 1자리, 미만은 2자리로 화면·복사 텍스트·Excel에 표시한다. Excel은 원본 v3 서식에 있는 `0.00%` 셀 서식을 써서 값과 서식 파일은 그대로다. 엔지니어 PC의 버튼 비활성은 내려받지 않고 연 미리보기 때문으로 확인되어, 그때 내려받아 Chrome/Edge로 열라고 안내한다. 웹 코드·DB 변경 없음.
- LOT Tracker HTML 1.2.8 화면 수율 (2026-10-05 main 반영·운영 배포): LOT 보고서 화면과 복사 텍스트가 YLD 비율을 1처럼 그대로 보여 주던 것을 Excel과 같은 `0.0%`(100.0%)로 표시한다. 보고서 값과 Excel은 같다. 사용자 검증 ZIP에서 그 밖의 문제는 아직 보고되지 않았다. 웹 코드·DB 변경 없음.
- LOT Tracker HTML 1.2.7 격리된 미리보기 (2026-10-05 main 반영·운영 배포): Claude 앱 미리보기처럼 HTML을 보안 격리 프레임에서 열면 머리글이 두 보기의 창을 직접 읽지 못해 "준비 중…"에 멈추던 문제를 고쳤다(1.2.3부터 같은 구조). 머리글과 보기 사이 연결을 `postMessage`로 바꿨다. 다운로드는 미리보기 설정에 따른다. 결과 Excel은 같다. 웹 코드·DB 변경 없음.
- LOT Tracker HTML 1.2.6 화면 언어 (2026-10-05 main 반영·운영 배포): 계보 추적 안에만 있던 한국어 / Tiếng Việt 선택을 상단 머리글로 옮겨 머리글·LOT 보고서·계보 추적이 함께 따른다. LOT 보고서 문구·상태·경고·검증 ZIP 안내를 베트남어로 표시하고 고른 언어를 브라우저에 기억한다. 업무관리 사이트에 넣을 때는 사이트 언어를 따르게 바꾼다. Excel 결과는 언어와 관계없이 같다. 웹 코드·DB 변경 없음.
- LOT Tracker HTML 1.2.5 MERGE 방향 (2026-10-04 main 반영·운영 배포): 사용자가 고른 대로 보고서 QTY 칸에 들어온 합병은 `+`, 나간 합병은 `-`를 붙인다. 각 LOT 이력의 합병 전·후 수량으로 확인된 경우만 부호를 붙이고, 확인되지 않으면 부호 없이 둔다. Excel에서는 부호가 보이도록 텍스트 셀로 저장하고 해당 열의 '텍스트로 저장된 숫자' 경고를 끈다. 원본 서식 파일은 그대로다. 웹 코드·DB 변경 없음.
- LOT Tracker HTML 1.2.4 보고서 변경 이력 행 (2026-10-04 main 반영·운영 배포): 사용자가 보낸 실제 결과 Excel과 검증 ZIP으로 확인한 오류를 고쳤다. 상세 LOT가 다시 분할되거나 루트로 합병되면 그 기록이 상대 LOT 행에 상대 LOT 자신의 ID로 나오고(예: 상세 행의 `SPLIT <자기 ID>`), 루트 행에는 들어온 `MERGE`가 빠졌다. 상세 LOT로 나가는 분할만 그 LOT의 탄생 행에 두고, 나머지는 기록이 나온 LOT 행에 상대 LOT ID로 표시한다. 공정 실적·82열 서식은 같다. `MERGE` 방향은 1.2.5에서 표시한다. 웹 코드·DB 변경 없음. 자세한 내용은 `lot-tracker/VERIFICATION.md`.
- LOT Tracker 단일 HTML 통합(PR #8, main `f3c9b9a`, 2026-10-04 병합): Offline HTML 보고서와 계보 추적(Trace)을 `lot-tracker/` HTML 하나(v1.2.3)로 합치고 요청한 v3 Excel 82열 양식을 내장했다. Windows·Offline HTML 자동 빌드를 없애고 "LOT Tracker HTML" 워크플로를 추가했다. 웹 코드·DB 변경 없음. 자세한 내용은 `lot-tracker/README.md`, `MIGRATION.md`, `VERIFICATION.md`.
- 웹 1.7.7 평가업무 종합 현황 겹침 (2026-10-04 main 반영·운영 배포): 넓은 화면(창 폭 약 1520px 이상)에서 검색·기간·필터 줄이 제목 줄로 올라가 "+ 수동 등록"·"Excel 가져오기" 버튼을 덮던 문제를 고쳤다. 원본 Q-EVAL CSS가 이 줄을 66px 끌어올리고 평가 화면 폭 1250px 이하에서만 풀기 때문이다. 원본 `globals.css`는 그대로 두고 `evaluation/host.css`에서 항상 제목 아래 줄에 두도록 했다(좁은 화면에서 이미 쓰던 배치). 기능·DB 변경 없음.
- 웹 1.7.6 LOT Tracker 고정 형식 보고서 언어 (2026-10-04 main 반영·운영 배포): 화면의 LOT Follow-up 표와 Excel 다운로드의 `LOT Follow-up` 시트가 화면 언어와 상관없이 영어로 나오던 문제를 고쳤다(스텝별 보고서는 이미 언어를 따랐다). 고정 형식 보고서 화면과 Excel에 화면 언어를 전달한다. DB 변경 없음.
- 웹 1.7.5 LOT Tracker 화면 디자인 (2026-10-04 main 반영·운영 배포): 지금 쓰는 See LOT 파일 분석 카드를 맨 위로 올리고, 아직 연결 전인 SWP 조회는 제목 옆 배지와 맨 아래 접힌 칸으로 옮겼다. 파일 선택은 점선 상자, 파일 오류는 빨간 상자로 표시한다. 보고서는 머리띠 카드에 LOT 수 배지를 두고, 보고서 형식·공정 기준을 한 줄 도구막대로, 스텝 선택을 켜고 끄는 칩으로 바꿨다. 표는 테두리 있는 스크롤 상자에서 머리글이 고정되고 공정 묶음 머리글에 색을 넣었으며, 장비명 등이 줄바꿈되지 않는다. Split·RUNID 안내는 색 상자, Excel 다운로드와 분석 결과 저장은 한 줄 버튼 묶음으로 정리했다. 웹 화면(`lot-tracker.js`, `lot-step-report.js`)만 바꿨고 Windows·HTML 오프라인 엔진은 그대로다. 분석·저장·다운로드 기능과 DB 변경 없음.
- 웹 1.7.4 사용자 관리 화면 디자인 (2026-10-04 main 반영·운영 배포): 목록 머리글에 전체 계정 수와 승인 대기 수 배지를 두고, 권한(관리자/일반)·상태(대기중/승인됨)를 색 배지로, 이름 앞에 첫 글자 아바타를 표시한다. 승인 대기 행은 옅은 노란색과 왼쪽 띠로 구분한다. 작업 버튼은 승인만 강조색, 나머지는 같은 무게의 테두리 버튼(차단·삭제는 빨간 글자)으로 맞췄다. 모바일은 계정별 카드로 보인다. 정보 수정·계정 삭제·임시 비밀번호 화면도 머리글(제목+목록으로 버튼)과 좁은 카드로 정리하고, 임시 비밀번호는 점선 상자에 크게 표시한다. 기준정보 표 카드의 클래스 이름을 공용(`table-card`, `data-table`)으로 바꿨다(화면 변화 없음). 기능·DB 변경 없음.
- 웹 1.7.3 기준정보 화면 디자인 (2026-10-04 main 반영·운영 배포): `/master` 종류 카드(아이콘·건수), 목록의 한 줄 조회 도구막대·건수 배지·정렬 표시·쪽 넘김 버튼, 상세·종류 관리·컬럼 편집 화면의 머리글(제목+목록으로 버튼)과 머리띠 카드를 일일업무 화면과 같은 조밀한 디자인으로 맞췄다. 체크박스가 글자 위로 떨어져 보이던 컬럼 옵션 줄을 한 줄로 고쳤다. 모바일 목록은 열이 많아 카드 대신 가로 스크롤 표를 유지한다. 조회 도구막대의 검색칸·선택칸 높이를 맞췄다(일일업무 화면 포함). 기능·DB 변경 없음.
- 웹 1.7.2 입력 화면 디자인·전체 화면 시스템 테마 (2026-10-03 main 반영·운영 배포): 일일업무 입력 목록(`/daily-items`)과 보고 입력 화면(`/daily-items/:id`)에 조회 화면과 같은 머리띠 카드, 한 줄 조회 도구막대, 상태 배지, 모바일 카드형 목록, 업데이트 이력 정리를 적용했다. 평가업무 화면은 원본 CSS를 그대로 두고 빌드(`evaluation/dark-theme.mjs`)에서 다크 모드 규칙을 만들어 덧붙여, 시스템 설정이 어두우면 사이트와 같은 어두운 색으로 표시한다. 밝은 모드의 평가 CSS·JS는 이전과 같다. 남아 있던 고정 색(평가 화면 틀 배경, 이력 구분선, 기준정보 개수 글자)을 테마 색으로 바꿨다. 기능·DB 변경 없음.
- 웹 1.7.1 평가업무 화면 구성·언어 (2026-10-02 main 반영·운영 배포): 한국어·영어 화면에 남던 베트남어 약 200개 문구와 서버 저장 이력 문장을 번역하고, 수량(1,000)·날짜(2026-10-02)를 언어별로 표시한다. 사이트 안 평가 화면의 중복 머리줄(언어·계정·로그아웃)을 없애고, iframe이 머리글 아래 높이를 채워 이중 스크롤을 없앴다. 등록·수정 창은 열릴 때 iframe이 화면 전체로 커져 잘리지 않는다. 평가 목록의 작업 버튼이 1366·1440 폭에서 잘려 누를 수 없던 문제를 2열 배치로 고쳤다. "기존 일반 업무 목록"은 왼쪽 하위 메뉴로 옮겼다. 원본 `globals.css`는 그대로 두고 사이트용 `evaluation/host.css`에서 조정한다. DB 변경 없음. 검증: 웹 362, 평가 35(새 언어 누락 검사 포함), dry-run, 미리보기 합성 데이터로 7개 메뉴 × 3개 언어, 등록·수정 창 8종, 1366·1440·1920·390 폭 확인.
- 웹 1.6.11 일일보고 조회 화면 디자인: 조회 조건을 한 줄 도구막대로 줄이고, 파트 카드에 머리띠와 건수 배지를 두고, 보고 한 건마다 상태색 띠(문제·지연 빨강, 완료 초록)를 붙였다. 이슈·조치는 옅은 노란 상자, 상세 보기는 작은 버튼 모양으로 바꿨다. 다크 모드 카드·테두리 대비를 조금 높였고, 다크 모드에서 인쇄해도 상태 배지가 밝은 색으로 나오게 했다. 기능·조회 결과·인쇄 내용은 같다.
- 웹 1.6.10 최적화: 일일보고 조회의 독립 조회 3개, 기준정보 목록의 전체 개수와 필터 선택지 조회를 동시에 실행한다. 기준정보 첫 화면은 세트별 개수 조회를 1회로 줄였다. 파트넘버 여러 줄 매칭은 최대 6개씩 동시에 조회한다. 선택지 일괄 등록은 한 묶음으로 저장해 중간 실패 시 전부 취소된다(이전에는 일부만 저장될 수 있었다). 쓰이지 않던 KPI 대시보드 번역 문구 15개(3개 언어, 45줄)를 삭제했다.
- 웹 디자인(`cbe7e0e`): 밝은 대시보드 테마로 바꾸고 시스템 다크 모드를 따른다. 기능 변경은 없다.
- LOT 계보 판정 통일(PR #6, `6f39c14`): 웹·Windows·HTML 세 엔진 모두 UUID 파일의 LOTID를 ASSYLOT·상호 Split 근거로만 복원하고, 번호 패턴으로 추정하지 않는다. HTML 1.0.5 LOT 공정표, 1.0.6 SMT 투입 RUN ID 인식을 포함한다.
- DB 스키마·Cloudflare 바인딩 변경은 없다.

## 검증과 한계

- LOT Tracker HTML 1.2.8·1.2.9 main 반영 배포: 2026-10-05 작업 브랜치를 main `991daf4`로 fast-forward 푸시한 뒤 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.7과 배포 ID(Worker 버전 ID) `f576f0e1-b7cd-40a9-9073-14aa8b2c646a`(2026-10-05T03:44:50Z)를 확인했다. 웹 코드는 바뀌지 않았다. 직전 운영 Worker 버전은 `e8b41f82-271b-45c4-846c-998225a85dc3`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. main 커밋의 "LOT Tracker HTML" 워크플로(빌드·보고서·계보·수량 속성·Chromium 검사)도 통과했다([run 37260623468](https://github.com/SBRGOM/techops/actions/runs/37260623468/job/111606891983)). 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- LOT Tracker HTML 1.2.9: 빌드 재현, 보고서 회귀 23건, 계보 회귀 28/28, 수량 속성 20 seed × 1000 × 20, 내장 v3 양식 103조건, Chromium 통합 검사 통과(수율 자릿수 검사 추가, 수정 전 실패). 실제 입력으로 Excel 값이 같고 100% 미만 수율 칸의 서식만 바뀐 것을 확인했다.
- LOT Tracker HTML 1.2.8: 빌드 재현, 보고서 회귀 23건, 계보 회귀 28/28, 수량 속성 20 seed × 1000 × 20, 내장 v3 양식 99조건, Chromium 통합 검사(화면 수율 검사 추가, 수정 전 실패) 통과. 사용자의 v1.2.7 검증 ZIP 입력으로 화면 100.0%와 Excel 시트 동일을 확인했다. 실제 파일은 Git에 넣지 않았다.
- LOT Tracker HTML 1.2.7 main 반영 배포: 2026-10-05 작업 브랜치를 main `933f044`로 fast-forward 푸시한 뒤 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.7과 배포 ID(Worker 버전 ID) `6905c7bb-9c1b-4258-ab56-816e21efbdf1`(2026-10-05T02:22:54Z)를 확인했다. 웹 코드는 바뀌지 않았다. 직전 운영 Worker 버전은 `5c8cb755-9ea4-4b8a-94dc-4c858d0de688`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. main 커밋의 "LOT Tracker HTML" 워크플로(빌드·보고서·계보·수량 속성·Chromium 검사)도 통과했다([run 37255145661](https://github.com/SBRGOM/techops/actions/runs/37255145661/job/111590501471)). 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- LOT Tracker HTML 1.2.7: 빌드 재현, 보고서 회귀 23건, 계보 회귀 28/28, 수량 속성 20 seed × 1000 × 20, 내장 v3 양식 99조건, Chromium 통합 검사(격리 프레임 검사 추가, 수정 전 실패) 통과. 실제 입력 8개로 격리 프레임에서 분석·언어·추적을 확인했고 결과 Excel 시트는 1.2.5와 같다.
- LOT Tracker HTML 1.2.6 main 반영 배포: 2026-10-05 작업 브랜치를 main `d94e2c7`로 fast-forward 푸시한 뒤 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.7과 배포 ID(Worker 버전 ID) `f367dc8c-e873-461e-9306-d03d455c8c8d`(2026-10-05T01:53:50Z)를 확인했다. 웹 코드는 바뀌지 않았다. 직전 운영 Worker 버전은 `8e46f74f-3b05-4473-8e88-1127e6bcce29`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. main 커밋의 "LOT Tracker HTML" 워크플로(빌드·보고서·계보·수량 속성·Chromium 검사)도 통과했다([run 37253194239](https://github.com/SBRGOM/techops/actions/runs/37253194239/job/111584863753)). 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- LOT Tracker HTML 1.2.6: 빌드 재현, 보고서 회귀 23건, 계보 회귀 28/28, 수량 속성 20 seed × 1000 × 20, 내장 v3 양식 99조건, Chromium 통합 검사(언어 전환 검사 추가) 통과. 실제 입력 8개로 두 언어 화면을 데스크톱·모바일 폭에서 확인했다. 실제 파일은 Git에 넣지 않았다.
- LOT Tracker HTML 1.2.4·1.2.5 main 반영 배포: 2026-10-04 작업 브랜치를 main `3b0b7d9`로 fast-forward 푸시한 뒤 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.7과 배포 ID(Worker 버전 ID) `3b565008-c70a-4e3a-a7f8-9d2d8b874849`(2026-10-04T15:22:37Z)를 확인했다. 웹 코드는 바뀌지 않았다. 직전 운영 Worker 버전은 `feff8721-5e26-4830-87b1-a1b88b2032ae`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. main 커밋의 "LOT Tracker HTML" 워크플로(빌드·보고서·계보·수량 속성·Chromium 검사)도 통과했다([run 37212727830](https://github.com/SBRGOM/techops/actions/runs/37212727830/job/111466998235)). 배포 기록 커밋 `bb5b1ee`의 main 반영으로 같은 코드가 다시 배포되어 배포 ID가 `86e371fc-8310-4db5-8461-ac2735d2e1eb`(2026-10-04T15:24:22Z)로 바뀌었다(Workers Builds 성공). 이 기록 보완 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- LOT Tracker HTML 1.2.5: 빌드 재현, 보고서 회귀 23건, 계보 회귀 28/28, 수량 속성 20 seed × 1000 × 20, Chromium 통합 검사, 내장 v3 양식 99조건 통과(새 양식 검사 4건은 내보내기 수정 전에는 실패). 사용자의 실제 입력 8개를 v1.2.5 HTML에 넣어 받은 Excel에서 MERGE 8건 모두 수량 변화와 맞는 부호를 확인했고 공정 실적은 그대로다. 실제 파일은 Git에 넣지 않았다.
- LOT Tracker HTML 1.2.4: 빌드 재현, 보고서 회귀 22건(새 합성 회귀는 수정 전 엔진에서 실패), 계보 회귀 28/28, 수량 속성 20 seed × 1000 × 20, Chromium 통합 검사, 내장 v3 양식 95조건 통과(`LOT_TRACKER_BROWSER_INLINE=1`). 사용자의 실제 입력 8개(검증 ZIP)를 v1.2.4 HTML에 넣어 Chromium에서 받은 Excel을 수정 전 결과와 대조했다: 공정 실적 6개 LOT 모두 같고 변경 이력 열만 바뀌었다. 실제 파일은 Git에 넣지 않았다.
- PR #8 병합 전 검증(main `000d014`에 로컬 병합한 결과): `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test` 371개, `pnpm test:evaluation` 43개, `wrangler deploy --dry-run`(웹 번들 크기 병합 전과 같음) 통과. LOT Tracker는 빌드 재현(커밋된 v1.2.3 HTML과 바이트 동일), 보고서 엔진 테스트, 계보 회귀 28/28, 수량 속성 검사 20 seed × 1000 × 20, Chromium 통합 검사, 내장 v3 양식 95조건이 통과했다(관리형 Chromium이 `file://`를 막아 `LOT_TRACKER_BROWSER_INLINE=1`로 실행). PR 문서의 한계는 그대로다: PC 작업 파일과 복원 코드의 바이트 일치, 요청 Excel과 전체 업무 값 일치는 확인되지 않았다.
- PR #8 병합 배포: 2026-10-04 main `f3c9b9a` 병합 후 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.7과 배포 ID(Worker 버전 ID) `5beda05c-7ac1-4c35-8392-8c3ad931a34a`(2026-10-04T05:35:56Z)를 확인했다. 웹 코드는 바뀌지 않았다. 직전 운영 Worker 버전은 `c8b84dd9-a702-497b-bfd8-4bb7bf82bf54`이다. DB 변경 없음. main 병합 커밋의 "LOT Tracker HTML" 워크플로(빌드·보고서·계보·수량 속성·Chromium 검사)도 통과했다([run 37180339598](https://github.com/SBRGOM/techops/actions/runs/37180339598/job/111371458384)). 상태 문서 커밋 `c7d3c90`의 main 반영으로 같은 코드가 다시 배포되어 배포 ID가 `2d6d2378-f0f4-44ba-8ef2-c8c8b1649ce3`(2026-10-04T05:38:16Z)로 바뀌었다. 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- 웹 1.7.7: `pnpm build:evaluation`, `pnpm check`, `pnpm test` 371개, `pnpm test:evaluation` 43개(새 배치 검사 1개 포함, 수정 전 묶음에서는 실패), `wrangler deploy --dry-run` 통과. 미리보기 합성 데이터로 종합 현황을 900~1920px 7가지 폭에서 확인했고, 평가 7개 메뉴를 1920·2560px에서 버튼·입력칸 겹침 검사로 확인했다(옛 규칙을 다시 넣으면 겹침 3건 검출).
- 웹 1.7.7 운영 배포: 2026-10-04 main `c3279a2` 푸시 후 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.7과 배포 ID(Worker 버전 ID) `658fce11-efad-40d0-b024-d40d2cbcc61b`(2026-10-04T05:26:36Z)를 확인했다. 운영 화면은 로그인이 필요해 직접 열어 보지 않았다. 롤백 지점은 직전 운영 1.7.6 Worker 버전 `dc0e87fb-f250-4c15-be00-5c034d8c4847`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- 웹 1.7.6: 고정 형식 보고서의 화면 표와 Excel 시트 첫 머리글이 한국어·영어·베트남어로 나오는지 보는 회귀 테스트 3개를 추가했고, 수정 전 코드에서 한국어·베트남어 2개가 실패하는 것을 확인했다. `pnpm check`, `pnpm test` 371개, `pnpm test:evaluation` 42개, `wrangler deploy --dry-run` 통과. 로컬 미리보기에서 한국어 고정 형식 보고서를 확인했다.
- 웹 1.7.6 운영 배포: 2026-10-04 main `8b96d36` 푸시 후 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.6과 배포 ID(Worker 버전 ID) `393a0485-c55f-4958-b35a-0308bc9e224f`(2026-10-04T05:12:57Z)를 확인했다. 운영 화면은 로그인이 필요해 직접 열어 보지 않았다. 롤백 지점은 직전 운영 1.7.5 Worker 버전 `c4261264-a2d6-4b5c-b209-82d7746f7bb5`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- 웹 1.7.5: `pnpm check`, `pnpm test` 368개, `pnpm test:evaluation` 42개, `wrangler deploy --dry-run` 통과. 합성 See LOT CSV 2개와 잘못된 CSV 1개로 로컬 미리보기에서 빈 화면·파일 오류·스텝별 보고서·고정 형식 보고서를 밝은/어두운 테마, 데스크톱/모바일에서 변경 전후 비교했다. 고정 형식 보고서의 LOT Follow-up 표가 한국어 화면에서도 영어로 나오는 기존 동작은 바꾸지 않았다.
- 웹 1.7.5 운영 배포: 2026-10-04 main `f68025f` 푸시 후 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.5와 배포 ID(Worker 버전 ID) `d02c78f9-c4a5-49e9-bb06-a5fc2c9e2ec7`(2026-10-04T05:06:47Z)를 확인했다. 운영 화면은 로그인이 필요해 직접 열어 보지 않았다. 롤백 지점은 직전 운영 1.7.4 Worker 버전 `6af157d3-b790-45bc-a541-b9e15ccd7cbb`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- 웹 1.7.4: `pnpm check`, `pnpm test` 366개, `pnpm test:evaluation` 42개, `wrangler deploy --dry-run` 통과. 로컬 미리보기에 합성 계정 5개(관리자 1, 승인 대기 2)를 넣어 사용자 관리 목록·정보 수정·계정 삭제·임시 비밀번호 화면을 밝은/어두운 테마, 데스크톱/모바일에서 변경 전후 비교했다.
- 웹 1.7.4 운영 배포: 2026-10-04 main `f3304df` 푸시 후 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.4와 배포 ID(Worker 버전 ID) `afc0eaac-5c17-4e29-9f53-35b00a9b5280`(2026-10-04T04:57:36Z)를 확인했다. 운영 화면은 로그인이 필요해 직접 열어 보지 않았다. 롤백 지점은 직전 운영 1.7.3 Worker 버전 `874de393-9c45-40e5-b633-7bf2edb3e793`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- 웹 1.7.3: `pnpm check`, `pnpm test` 365개, `pnpm test:evaluation` 42개, `wrangler deploy --dry-run` 통과. 로컬 미리보기에 합성 기준정보 70행을 넣어 기준정보 7개 화면을 밝은/어두운 테마, 데스크톱/모바일에서 변경 전후 비교했다.
- 웹 1.7.3 운영 배포: 2026-10-04 main `61c017f` 푸시 후 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.3과 배포 ID(Worker 버전 ID) `d66b41f3-6bc9-44e2-8080-b898adf1238d`(2026-10-04T04:44:51Z)를 확인했다. 운영 화면은 로그인이 필요해 직접 열어 보지 않았다. 롤백 지점은 직전 운영 1.7.2 Worker 버전 `b3baee10-1dfc-4f0a-9ab4-c2032f25dd62`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- 웹 1.7.2: `pnpm build:evaluation`, `pnpm check`, `pnpm test` 363개, `pnpm test:evaluation` 42개, `wrangler deploy --dry-run` 통과. 평가 CSS는 새 빌드의 앞부분이 이전 CSS와 바이트 단위로 같고 JS는 동일함을 확인했다. 로컬 미리보기(데모·합성 평가 데이터)로 20개 화면과 평가 등록 창 4종을 밝은/어두운 테마, 데스크톱/모바일에서 변경 전후 비교했다.
- 웹 1.7.2 운영 배포: 2026-10-03 main `10e12cf` 푸시 후 Cloudflare Workers Builds 성공, `/api/version`에서 1.7.2와 배포 ID(Worker 버전 ID) `1477ef14-e77f-4c3f-b04c-a06a2e958149`(2026-10-03T01:51:26Z)를 확인했다. 운영 화면은 로그인이 필요해 직접 열어 보지 않았다. 롤백 지점은 직전 운영 1.7.1 Worker 버전 `f4a1e3bb-74e4-4a06-8bd0-8a8c21fcc6a2`이다(`wrangler rollback <버전 ID>`). DB 변경 없음. 이 기록 커밋의 main 반영도 자동배포를 일으키며 코드는 같으므로 배포 ID만 새로 바뀐다.
- 웹 1.6.11: `pnpm check`, `pnpm test` 362개 통과, `wrangler deploy --dry-run` 통과. 로컬 미리보기(데모 데이터)로 `/daily-reports`를 밝은/어두운 테마, 데스크톱/모바일, 상세 펼침, 인쇄 화면에서 변경 전후를 비교했다.
- 웹 1.6.10: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test` 362개 통과, `wrangler deploy --dry-run` 통과. 최적화 경로 회귀 테스트 3개(선택지 일괄 등록 결과, 기준정보 세트별 개수, 필터 선택지)를 추가했고, 이 3개는 최적화 전 코드에서도 통과해 동작이 같음을 확인했다. 로컬 미리보기에서 바뀐 화면의 응답을 확인했다.
- HTML 1.0.6: main `3f78ad8` 기준으로 엔진 테스트, LOT 규칙, 빌드 재현, Chrome 오프라인 E2E를 이 환경에서 통과했다. 이후 HTML 엔진 변경은 없다.
- Windows 1.0.3: GitHub Actions(`3f9601d`)에서 빌드와 전체 테스트를 통과했다. 이 환경에서는 Windows 빌드를 실행하지 않았다.
- 세 엔진의 LOT 판정은 합성 데이터로만 검증했다. 실제 See LOT 업무 데이터 확인은 남아 있다.
- 웹 테스트(`node test.mjs`)는 GitHub Actions에 포함되어 있지 않다.

## 남은 작업

- 통합 LOT Tracker HTML을 업무망 Chrome/Edge에서 실제 MES·PMS 파일로 확인한다(`lot-tracker/releases/LOT-Tracker-v1.2.9.html`): 요청 Excel과 행 배치·업무 값 대조, 실제 See LOT UUID 파일의 계보 판정과 SMT 투입 RUN ID 인식, PC 작업 폴더와 복원 코드 차이.
- 과거 Windows·Offline HTML 엔진의 고정 형식 보고서 LOT Follow-up 영어 표시는 두 제품이 종료되어 고치지 않는다. 통합 HTML 보고서 화면은 이 표를 그리지 않는다(`lot-tracker/report/build/app.js`는 엔진의 파일 해석만 사용).
- 웹 테스트를 GitHub Actions에 넣을지 결정한다.
- 출장자 관리 원본 자료, SMT RUNID의 그 밖의 후보 판정 규칙, 애매한 Split/Merge 원본, 내부망 최대 부하 확인.
- LOTID 자리 규칙의 미확정 사항(Split 구분값 금지 목록, 증가 순서, 연말 경계)은 `desktop/LOT-RULES.md` 참고.
- `claude/dreamy-galileo-h9chqi`의 HTML 1.1.1은 별도 브랜치이며 현재 기준에 통합하지 않았다.
- 이메일 발송 재설정과 SWP 직접 연동은 보류한다.

이전 기록은 `docs/history/`에 원문 그대로 있다: PR #6 통합 경위는 `DEVELOPMENT-STATUS-20260925.md`, 2026-09-23까지는 `CLAUDE-20260923.md`. 당시 기록이며 현재 상태가 아니다.
