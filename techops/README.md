# 제품기술 업무관리 (workmanager)

SSD/Module의 일일보고·평가업무·기준정보·LOT 분석을 관리하는 Cloudflare Worker다. 서버와 HTML은 `worker.js`, LOT 로직은 별도 모듈에 있다.

- 운영: https://workmanager.ktsp.workers.dev
- 저장소: https://github.com/SBRGOM/techops (비공개)
- 현재 버전·검증·미완료 사항: [개발 현황](DEVELOPMENT-STATUS.md)
- 개발 위치·업무 규칙: [AGENTS.md](AGENTS.md)
- 설치·브랜치·배포: [CONTRIBUTING.md](CONTRIBUTING.md)

## 제품

| 제품 | 실행 방식 | 안내 |
|---|---|---|
| 업무관리 웹 | Cloudflare Workers + D1 + Workers AI | 루트 소스와 package.json |
| LOT Tracker HTML | 단일 HTML: LOT 보고서·계보 추적 | [개발 안내](lot-tracker/README.md) |

LOT Tracker는 `lot-tracker/release.json` 한 곳에서 버전을 관리한다. 과거 Windows와 Offline HTML 소스는 비교 자료로만 보존한다.

## 주요 기능

- 회사 계정 가입·로그인, 관리자 승인·권한·차단·일반 계정 관리. 계정 삭제 시 업무 이력과 담당자명은 보존한다.
- `/daily-reports` 조회, `/daily-items` 입력, `/daily-fields` 관리자 설정. SSD/Module 5단계 분류, 동적 필드와 설정 CSV, 계정 이름으로 고정된 보고 담당자.
- 한국어·영어·베트남어 UI와 번역 캐시. LOTID·파트넘버·랏넘버·숫자는 원문 보존.
- `/tasks` 평가업무, `/master` 기준정보, `/lot-tracker` 파일 분석·Excel 보고서. LOT INFO 전용 화면은 없지만 내부 LOT 조회·저장 기능은 유지한다.
- 전수분석은 메뉴와 구현 범위를 구분한다. 출장자 관리 기존 자료는 미확인이다.

## 로컬 실행

Node.js 22 이상과 package.json의 pnpm 버전을 사용한다. 단일 LOT Tracker HTML 빌드는 `node lot-tracker/build.mjs`이며, Windows 네이티브 빌드는 종료했다.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm test
corepack pnpm preview
```

미리보기: http://127.0.0.1:8788/daily-reports — 메모리 DB이며 운영 자료를 사용하지 않는다.

main push는 Cloudflare 운영 자동배포를 시작한다. 운영 상태는 `/api/version`으로 확인한다. 데이터 초기화·과거 migration 일괄 실행은 일반 개발 절차가 아니다. 실제 업무 자료·인증 정보·검증 ZIP은 커밋하지 않는다.
