# 팀 개발 안내

## 저장소 접근

공동 개발 저장소는 비공개 `https://github.com/SBRGOM/techops`입니다. 저장소 소유자가 팀원의 GitHub 사용자명을 확인해 Collaborator로 초대하고, 팀원이 초대를 수락합니다. 사이트의 관리자 계정과 GitHub 개발 권한은 별개입니다. Cloudflare 운영 권한은 배포 담당자에게만 부여하는 것을 권장합니다.

## 개발 시작

Node.js 22 이상과 package.json에 지정된 pnpm 버전을 사용합니다.

```sh
git clone https://github.com/SBRGOM/techops.git
cd techops
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm preview
```

미리보기 주소는 `http://127.0.0.1:8788/daily-reports`입니다. 메모리 DB와 예시 계정을 사용하므로 Cloudflare 계정 없이 개발할 수 있습니다. 실제 데이터는 세션 종료 시 보존되지 않습니다.

Wrangler 로컬 D1이 필요한 경우 `.dev.vars.example`을 `.dev.vars`로 복사해 개인 개발값을 설정하고 `pnpm db:init`, `pnpm dev`를 실행합니다. `.dev.vars`, 인증 토큰, DB 백업은 커밋하지 않습니다.

## 작업과 리뷰

1. `git fetch origin` 후 최신 `origin/main`에서 기능별 브랜치를 만듭니다. 예: `git switch -c codex/master-search origin/main`.
2. 시작 전에 열린 브랜치와 PR을 확인합니다. 같은 worker.js 영역을 수정하는 팀원과 작업 범위를 조율합니다.
3. 필요한 코드를 수정하고 `pnpm check`, `pnpm test`를 실행합니다. 화면 변경은 로컬 미리보기에서도 확인합니다.
4. 브랜치를 push하고 변경 목적, 테스트 결과, DB 변경 여부를 적은 PR로 공유하는 방식을 권장합니다. 현재 저장소에 필수 리뷰나 브랜치 보호 설정을 추가하지는 않았습니다.
5. 배포 담당자가 최신 main 변경을 반영하고 검증한 후 병합합니다. **main push는 기존 Cloudflare 자동배포를 시작합니다.** 작업 브랜치만 push하는 단계와 구분합니다.
6. Cloudflare `Workers Builds: workmanager` 성공 및 운영 `/api/version`을 확인합니다.

DB 변경은 코드 배포 전에 호환성을 확인하고, 변경 범위·복구 지점·적용 SQL·적용 결과를 기록합니다. 공유 작업 중 운영 데이터 초기화 SQL을 실행하지 않습니다.

## 배포 버전

- 릴리스 번호는 `package.json`의 `version` 한 곳에서 관리합니다. 첫 표시 버전은 `1.0.0`입니다.
- 호환되는 기능 추가는 minor, 오류 수정은 patch, 호환성이 깨지는 변경은 major 증가를 권장합니다.
- 사이트 왼쪽 아래에 릴리스 번호와 현재 Cloudflare Worker 버전 ID의 앞 8자리가 표시됩니다. 전체 값은 `/api/version`에서 확인합니다.
- 배포 ID는 실행 중인 Worker에 연결된 `CF_VERSION_METADATA`에서 자동으로 읽습니다. Git 커밋 해시와는 다른 값입니다. 배포 체크 화면에서 Git 커밋과 Worker 버전 ID를 대조할 수 있습니다.
- `createdAt`은 Worker 버전 생성 시각입니다. 롤백 등으로 트래픽을 전환한 시각을 뜻하지 않습니다.
- 로컬에서는 메타데이터가 없을 수 있으므로 배포 ID를 임의로 생성하지 않습니다.

기존 `main → Cloudflare Workers Builds → 운영` 흐름은 유지합니다. 단일 worker.js 구현과 운영 제약은 CLAUDE.md를 함께 참고하세요.
