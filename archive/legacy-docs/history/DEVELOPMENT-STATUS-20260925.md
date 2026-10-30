# 개발 현황 — 2026-09-25

웹 LOT Tracker 복구/수정 작업과 `codex/lot-tracker-local-validation`(데스크톱·HTML LOT 계보 수정 및 후속 기능, 이전 PR #5)을 PR #6으로 통합해 2026-09-25 main에 병합했다(`6f39c14`).

| 제품 | 버전 | 기준 |
|---|---|---|
| 업무관리 웹 | 1.6.9 | package.json, worker.js, 루트 LOT 모듈 |
| LOT Tracker Windows | 1.0.3 | desktop/release.json, desktop/engine |
| LOT Tracker HTML | 1.0.6 | desktop/offline-web/release.json 및 engine |

main 병합은 Cloudflare 운영 자동배포를 시작한다. 이 문서를 갱신한 세션에서는 운영 URL 접근이 네트워크 정책으로 막혀 `/api/version`에 1.6.9가 반영됐는지 확인하지 못했다. 배포 반영 여부는 `/api/version`으로 직접 확인한다.

## 이번 변경 — 세 엔진의 LOT 계보 판정을 같은 원칙으로 통일 + HTML 후속 기능

웹·Windows·HTML 세 엔진은 각자 별도 코드지만, 모두 See LOT 이벤트를 분석해 Split/Merge로 이어지는 LOT의 부모-자식 관계와 현재 상태를 판정한다. 통합 전까지 이 판정 로직에 같은 종류의 휴리스틱 버그가 있었고(아래 "발견 경위" 참고), 세 엔진 모두에서 같은 원칙으로 고쳤다.

**공통 수정 (세 엔진 모두)**
- 보안 다운로드로 파일명이 UUID가 된 See LOT 파일은 `ASSYLOT` 또는 상호 Split 이력(업로드된 다른 파일과 서로를 가리키는 실제 이벤트 근거)으로만 실제 LOTID를 복원한다. **번호/문자 패턴만으로 부모 LOTID를 지어내지 않는다** — 예: `H1AB000639/H2AB000639/H3AB000639`에서 `H0AB000639`를 추정하는 동작은 실제 반례가 확인되어 제거했다(`desktop/LOT-RULES.md`).
- Merge 방향(유입/유출)은 전후 수량 매칭으로 판정하고, 불확실하면 "병합 방향 확인 필요"로 남긴다. 이전에는 항상 "유입"으로 가정했다.
- Terminated 상태를 임의로 Merge 표시로 덮어쓰지 않는다. 종료되는 것은 수량을 보낸 원래 LOT이며 대상 LOT의 종료를 뜻하지 않는다.
- LOT Split Flow는 나중에 Merge가 발생해도 이전 Split 이력을 계속 표시한다(전에는 사라졌다).
- PCB Split/Merge 맵 파일(NO/LOT_ID/SPLIT_LOT/MERGE_LOT 등 고정 헤더)은 읽지만, 공정 이력이나 계보 근거가 아닌 참고 메타데이터로만 표시한다(PCB_ARRAY 합계로 수량을 추정하지 않는다).

**Windows/HTML 전용**
- HTML은 관측 공정 선택 UI(체크박스, 전체선택/해제, 적용)를 복구했다(1.0.3). 기존 `M121부터` 고정양식 탭·Excel은 HTML에서 제거(Windows는 유지).
- HTML 1.0.5: `LOT 공정표`를 화면 첫 탭·Excel 첫 시트로 추가. M010-M015·M033과 SPLIT LOT별 M050·M055 1/2차·M060을 한 행 계층으로 표시하고, 2D 바코드 맵의 FAB·TIER·OPT·PCB_ARRAY 합계는 근거가 일치할 때만 표시한다.
- HTML 1.0.6: M010 투입 발행·종료·전체 Split 수량과 자식 LOT 계열이 모두 일치하는 UUID 파일을 5~7자리 `000` **SMT 투입 RUN ID**로 인식한다. 해당 RUN ID 한 건에 대해서만 PMS 정보(PART NO·FAB·TIER·OPT·투입수량)를 요청하고, 자식 LOT 전체를 자동으로 추가 요청하지 않는다. PMS 직접 연동은 미구현(정보 파일 추가 후 재분석하는 흐름).
- LOTID 자리 규칙 확인/미확정 사항을 `desktop/LOT-RULES.md`에, 향후 내부망 SQL 조회 연결 설계를 `desktop/INPUT-CONTRACT.md`에 문서화했다.
- Windows 1.0.1→1.0.3, HTML 1.0.1→1.0.6.

**웹 전용**
- `TrackInCancel`과 대응 TrackIn, Cancel 계열 이벤트를 공정 실적·상태·타임스탬프 이력에서 제외한다(`withoutCancelledEvents`).
- Hold 후 Release가 없으면 이후 Split 등 다른 이벤트가 있어도 Hold를 현재 상태로 유지한다. 외주 반출입(SubcontractOut/In) 상태를 추가했다.
- 스텝별 화면·Excel과 LOT Tracker 화면·Excel에 `LOT Follow-up`(업로드 LOT, 후속 조회가 필요한 Split LOT, RECYCLELOTID)과 `LOT Split Flow`, `Scrap Summary` 시트를 추가했다.
- 기존 RUNID 메타데이터 CSV 연결 기능(웹 전용, desktop에는 없음)과 위 계보 판정이 함께 동작하도록 병합했다.
- DB 스키마·Cloudflare 바인딩 변경 없음.

## 발견 경위 (2026-09-25, GitHub/Cloudflare 확인)

- 로컬(사용자 PC)에 2026-09-23 시점 미커밋 스냅샷으로 남아 있던 웹 LOT Tracker 작업을 복구해 먼저 커밋했다. 이 스냅샷은 UUID 파일명에서 번호 패턴만으로 부모 LOTID를 추정하는 로직을 포함하고 있었다.
- 이후 GitHub를 확인하는 과정에서 **PR #5**(`codex/lot-tracker-local-validation` → main, draft)가 이미 존재하는 것을 발견했다. 데스크톱/HTML 엔진에서 **똑같은 종류의 패턴 추정 버그를 사용자가 직접 실 데이터로 재현해 찾아내고 고친 PR**이었다(`desktop/LOT-RULES.md`에 반례 기록).
- 웹 엔진에도 같은 버그가 남아있는 상태였으므로 PR #5의 수정을 웹에 포팅하고, 두 작업을 이 브랜치(`claude/keen-gauss-r8t5nj`)로 병합해 **PR #6**을 열고 PR #5는 닫았다.
- 이후 `codex/lot-tracker-local-validation`에 LOT 공정표(1.0.5)와 SMT 투입 RUN ID 인식(1.0.6) 커밋 3개가 추가로 올라와 있는 것을 확인해 PR #6 브랜치에 다시 병합했다.
- 사용자 지시로 PR #6을 main에 병합했다(`6f39c14`). 병합 직전 main과 `codex/lot-tracker-local-validation`에 PR #6에 없는 커밋이 없음을 확인했다.
- Cloudflare 운영 배포는 이 샌드박스의 네트워크 정책이 `workmanager.ktsp.workers.dev`/`api.cloudflare.com`을 차단해 직접 확인하지 못했다(허용 목록: `registry.npmjs.org`, `raw.githubusercontent.com`, GitHub git 프로토콜 정도). `wrangler`도 미인증 상태였다.

## 검증과 한계

아래는 모두 실제로 실행한 결과다. 대상 커밋이 서로 다르므로 함께 적는다.

| 제품 | 실행한 검증 | 대상 커밋 | 결과 |
|---|---|---|---|
| 웹 1.6.9 | `node --check worker.js`, `node test.mjs` | main `6f39c14` | 359개 통과, 0개 실패 |
| HTML 1.0.6 | GitHub Actions `LOT Tracker Offline HTML` 실행 #12: `pnpm install --frozen-lockfile`, `engine/test-runid-port.mjs`, `test-lot-rules.mjs`, `test-build.mjs`, Playwright Chromium 오프라인 E2E | PR #6 최종 `3f9601d` | 통과 |
| Windows 1.0.3 | GitHub Actions `LOT Tracker Offline` 실행 #17: 빌드, `test-offline`, `test-lot-rules`, `test-tracking`, `test-run-maps`, `test-validation`, `test-version` | PR #6 최종 `3f9601d` | 통과 |

- `3f9601d`와 `6f39c14`는 파일 내용이 같다. `6f39c14`는 main에 병합하며 생긴 merge commit이고, 그 사이 main에 다른 변경은 없었다.
- 웹 테스트는 네트워크가 제한된 세션에서 실행했다. `cdn.sheetjs.com`이 막혀 `pnpm install`이 실패하므로, 저장소의 SheetJS 0.20.3 사본(`desktop/offline-web/vendor/xlsx.full.min.js`)을 `.cjs`로 감싸 gitignore된 `node_modules/xlsx`에 연결했다. 버전은 같지만 `package.json`이 지정한 설치본과 같은 파일은 아니다. 이 사본이 이전 시도에서 빈 객체를 반환한 원인은 루트 `package.json`의 `"type": "module"` 때문에 ESM으로 로드된 것이었다.
- 웹 테스트 중 계보 수정 관련 항목(번호 패턴으로 부모를 추정하지 않음, PCB 맵은 참고 정보로만 표시, UUID의 ASSYLOT·상호 Split 복원, Follow-up 목록)과, 수정 이후 영향이 걱정되던 RUNID 메타데이터 연결 테스트와 `Hold M165` 상태 테스트가 모두 통과했다.
- 웹 테스트는 GitHub Actions에 포함되어 있지 않다. 두 workflow는 데스크톱·HTML 경로만 다루고 `node test.mjs`를 실행하지 않는다.
- `pnpm exec wrangler deploy --dry-run`은 실행하지 않았다. 대신 PR #6의 Cloudflare Workers Builds 프리뷰 배포(`3f9601d`)가 성공했다. 프리뷰 워커는 `wrangler.toml`에 프리뷰 전용 바인딩이 없어 운영 D1·Workers AI 바인딩을 공유한다.
- 세 엔진 모두 **합성 데이터로만 검증했다. 실제 See LOT 업무 데이터로 재현·판정한 적은 아직 없다.** LOTID 자리의 Split 구분값 부여 금지 목록, 증가 순서, 연도/ISO 주차 연말 경계는 여전히 미확정이다(`desktop/LOT-RULES.md`).

## 남은 작업

- **운영 반영 확인** — `/api/version`에서 1.6.9와 main `6f39c14` 이후 커밋이 보이는지 확인.
- **실제 See LOT UUID 다운로드 파일로 계보 판정 및 SMT 투입 RUN ID 인식 확인** — 사용자가 `desktop/offline-web/dist/LOT-Tracker-Offline-Web-v1.0.6.html`을 업무망 PC의 Chrome/Edge로 직접 열어 확인. 판정이 기대와 다르면 파일·LOT·기대값을 받아 회귀 테스트로 추가.
- 웹 테스트(`node test.mjs`)를 GitHub Actions에 넣을지 결정.
- 출장자 관리 원본 자료, SMT RUNID의 그 밖의 후보 판정 규칙, 애매한 Split/Merge 원본, 내부망 최대 부하 확인.
- LOTID 자리 규칙의 미확정 사항(Split 구분값 부여 금지 목록, 증가 순서, 연말 경계) 확정.
- `claude/dreamy-galileo-h9chqi`의 HTML 1.1.1은 별도 개발 브랜치다. 연결 규칙·라이브러리·검증 차이가 있어 현재 기준에 통합하지 않았다.
- 이메일 발송 재설정과 SWP 직접 연동은 보류한다.

이전 통합 기준은 PR #3 / 71cc5d1이다. 이전 미커밋 작업·검증 기록은 로컬 outputs/local-saves에 보존되어 있다. outputs/github-handoff는 독립 클론이 아니라 연결된 보존 worktree다.
