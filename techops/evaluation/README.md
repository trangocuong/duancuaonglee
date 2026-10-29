# 평가업무 관리 — Q-EVAL v75 이식

기존 사이트 `/tasks`에 원본 React 평가관리 화면을 연결한다. 사이트 사이드바를 유지하고 별도 문서에서 평가 UI 스타일을 격리한다.

## 포함 기능

- 종합 현황: 자격 평가 진행, 유형별 현황, 검색과 기간 조회, Lot 상세와 공정 진행.
- 평가 목록: DOE/PFQ/PRQ/FQ/1K/2K/5K/10K/PGM/EQP/Product Expansion, 필터·페이지·등록·수정·삭제.
- 수동 등록: 공정 추가/삽입/삭제, 시간·수량·Fail code·수율·대기 사유, Split Lot, RDT/TC/Humidity/배송 정보.
- Excel: 원본 평가 workbook/SEE LOT 파싱, 여러 SEE LOT 및 붙여넣기 업데이트, 템플릿 기반 평가 보고서, 대량 보고 Excel, CSV.
- 신제품 평가: 평가번호별 DOE→PFQ→PRQ→FQ 진행과 상세.
- 대량 보고: 1K/2K/5K/10K Lot별 공정 데이터 저장·수정·삭제·Excel.
- 업데이트 이력, 보고서·통계, 평가 조회/수정 권한 관리.

`app/page.tsx`, `app/lib`와 여섯 domain API는 원본 v75 구현에서 가져와 API 경로·DB 컨텍스트·인증·언어 표시를 사이트용으로 수정했다. Next/vinext 서버와 별도 비밀번호/세션 구현은 기존 사이트 인증으로 통합했다. 원본에 없는 기능은 구현 완료로 주장하지 않는다.

## 계정과 데이터

- 기존 `techops_users`/`techops_sessions` 로그인, 승인 및 회원 IP 제한을 사용한다.
- 사이트 관리자는 평가 관리자이다. 일반 회원은 기본 조회 권한이며 평가 권한 관리에서 수정 권한을 부여한다. 사이트 관리자 승격/취소는 기존 사용자 관리에서 처리한다.
- API는 `/api/evaluation/*`이며, 사이트의 동일 출처 변경 요청 검사를 통과한 후 인증 사용자 컨텍스트로 실행한다. 요청별 WeakMap으로 사용자/DB 컨텍스트를 격리한다.
- 새 테이블은 `qeval_evaluations`, `qeval_evaluation_logs`, `qeval_evaluation_timeline`, `qeval_mass_evaluation_reports`, `tech_eval_permissions`이다.
- `schema.sql`은 새 평가 테이블을 위한 일회성 추가 migration이다. 기존 업무 테이블은 변경하지 않는다. 운영 적용 전 별도 승인이 필요하다. 반복 적용/동기화 용도로 실행하지 않는다.
- 기존 일반 업무 목록은 `/tasks/legacy`, 기존 상세/수정 API는 그대로 유지한다.

## 빌드와 확인

```sh
pnpm install --frozen-lockfile
pnpm build:evaluation
pnpm check
pnpm test:evaluation
pnpm test
node preview.mjs
```

`build.mjs`는 React/CSS/Excel 템플릿을 `generated/assets.js`, API를 `generated/server.js`로 생성한다. 빌드는 원본 CSS를 그대로 두고, 그 뒤에 `dark-theme.mjs`가 만든 다크 모드 규칙(시스템 설정이 어두울 때만 적용)을 덧붙인다. 생성 파일을 커밋하므로 기존 Worker 실행 환경과 Node 미리보기에서 동일한 번들을 사용한다. 평가 소스 수정 후 반드시 재빌드한다.

`preview.mjs`는 메모리 DB에 기존/평가 스키마와 미리보기 관리자를 생성한다. 이 데이터는 서버 종료 시 사라진다. `test.mjs`는 합성 데이터만 사용하는 평가 CRUD·공정 누적·권한·Excel 검증이다. 실제 업무 Excel 검증 및 운영 DB migration/배포는 별도 범위이다.
