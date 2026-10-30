# 개발 시작

- 먼저 `git status --short`, 현재 브랜치, `DEVELOPMENT-STATUS.md`를 확인한다. 미커밋 변경을 보존하고 `codex/` 브랜치에서 작업한다.
- 질문에 관련된 파일·함수만 `rg`로 찾아 읽는다. `outputs/`, `node_modules/`, `desktop/offline-web/vendor/`, `desktop/offline-web/dist/`, `docs/history/`는 일반 코드 탐색에서 제외하고 필요한 경우만 연다.
- `worker.js`는 의도된 단일 Worker 구조다. `rg -n '^// #region|function 함수명' worker.js`로 관련 영역을 찾고 수정 범위의 전체 함수를 읽는다.

## 코드 위치

| 작업 | 시작 파일 |
|---|---|
| 인증·권한·일일보고·기준정보 | `worker.js`의 해당 region |
| 번역·호출 절약 | `resolveTrilingualText`, `buildDisplayTranslationMap`, `saveDailyUpdate`; `test-translation.mjs` |
| 표준 분류·설정 CSV | `daily-report-config.js`, `daily-field-csv.js` |
| 웹 LOT 분석·보고서·조회 | `lot-tracker.js`, `lot-step-report.js`, `lot-info.js`; `test-lot-steps.mjs` |
| LOT Tracker 단일 HTML | `lot-tracker/AGENTS.md`, `lot-tracker/README.md`, `lot-tracker/MIGRATION.md` |
| 과거 운영 이력 | `docs/history/CLAUDE-20260923.md`에서 날짜·주제 검색 |

## 유지할 제약

- 2026-10-02 사용자 요청에 따라 LOT Tracker는 `lot-tracker/`의 단일 HTML·단일 release.json으로 관리한다. Python과 네이티브 Windows 개발은 종료한다. `desktop/`은 과거 비교 자료이며 새 릴리스를 만들지 않는다. 운영 workmanager는 별도로 유지한다.
- `workmanager`, `DB`/`AI`/`CF_VERSION_METADATA` 바인딩을 유지한다. 시크릿·실제 업무 파일·검증 ZIP은 Git에 넣지 않는다.
- 기존 업무·보고·담당자 이름을 보존한다. 표준 설정 적용과 과거 migration은 이력 삭제를 포함할 수 있으므로 동기화나 오류 복구 목적으로 재실행하지 않는다.
- 방콕 보고일, 표준 70개 분류, 상태 코드와 번역 표시명의 구분을 유지한다. LOTID·파트넘버·랏넘버는 번역하지 않는다. 회원 IP 제한과 관리자 예외를 유지한다.
- 일일보고는 EAV, 기준정보는 data_json 구조다. LOT INFO 화면 제거는 내부 저장소 삭제를 뜻하지 않는다.
- 이메일 발송 재설정과 SWP 직접 연동은 별도 요청 전 보류한다. 출장자 관리 원본·SMT 후보 업무 규칙은 미확정이다.

## 검증·전달

- 웹 변경: `pnpm check`, `pnpm test`, `pnpm exec wrangler deploy --dry-run`. 화면 변경은 로컬 미리보기에서 확인한다.
- 관련 제품의 하위 AGENTS 검증을 따른다. 실패 재현이 있는 버그는 합성 입력 회귀 테스트를 추가한다.
- main 병합 전 원격 변경을 확인한다. main push는 운영 자동배포이므로 검증된 변경을 한 번에 반영하고 `/api/version`을 확인한다.
- main에 배포하면 별도 요청 없이 같은 작업에서 배포 기록을 남기고 그 기록도 main에 반영한다(2026-10-04 사용자 요청). push 전 `/api/version`의 배포 ID(롤백 지점)를 적어 두고, Cloudflare Workers Builds와 관련 GitHub 워크플로가 끝난 뒤 결과, 새 버전·배포 ID·시각, DB 영향을 `DEVELOPMENT-STATUS.md`의 `검증과 한계`에 쓰고 `CLAUDE.md`의 해당 줄에 운영 배포 확인을 표시한다. 기록 커밋도 같은 코드로 다시 배포되어 배포 ID만 바뀌므로 그 사실을 기록 안에 미리 적고, 기록만을 위한 추가 커밋은 만들지 않는다. 기록 커밋의 빌드 성공은 확인해 사용자에게 알린다.
- 제품 동작 변경 시 해당 버전을 올린다. 결과는 변경·검증·배포/DB 영향·남은 제한만 간결하게 기록한다. 과거 성공 기록을 이번 실행 결과로 표현하지 않는다.

## 사용량 95% 인계

- 개발 중 확인 가능한 Codex 사용량 창 중 하나라도 사용률이 95% 이상(잔여 5% 이하)이면 새 구현을 시작하지 않고 안전한 중간 지점에서 중지한다.
- 중지 전에 실행 중인 파일 쓰기·빌드·테스트만 정상 종료하고, 실패를 숨기거나 테스트를 통과한 것으로 표현하지 않는다. 운영 배포·main 병합·DB 변경은 인계를 위해 새로 실행하지 않는다.
- `git status --short`, 현재 브랜치와 HEAD, 변경 파일, 완료한 작업, 실제 실행한 검증과 결과, 실패·미검증 항목, 다음 한 단계, 금지사항을 확인한다.
- 루트 `CLAUDE-CODE-HANDOFF.md`의 상태 구역과 복사용 프롬프트를 현재 사실로 갱신한다. 실제 업무 파일·시크릿·내부망 경로·검증 ZIP 내용은 기록하지 않는다.
- 사용자에게 사용량 기준으로 중지했음을 알리고 `CLAUDE-CODE-HANDOFF.md`를 Claude Code의 첫 프롬프트로 전달하도록 안내한다.
