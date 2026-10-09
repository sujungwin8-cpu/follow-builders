# follow-builders

## 현재 상태
AI 개발자 소식과 팟캐스트·블로그를 모으는 원본 프로젝트의 공개 포크입니다. 이번 수정은 이 포크의 피드 생성기에 적용합니다.

2026-10-03~09의 Generate Feeds 예약 실행은 실패 상태였습니다. 10월 8일과 9일 로그에서 패키지 설치 성공 뒤 `POD2TXT_API_KEY not set` 종료와 두 수집 키의 빈 환경변수를 확인했습니다. 이 문서는 2026-10-10(한국 시간) 복구 변경의 로컬 검증 시점 기록입니다. 수정본 GitHub 실행·노션 게시 성공은 아직 확인 기록 없음입니다.

## 주요 기능
- 기본 실행: 공개 블로그를 먼저 수집하고, X·팟캐스트는 각 키가 있는 경우에만 실행합니다.
- 명시적인 단독 실행: `--blogs-only`는 키가 필요 없고, `--tweets-only`와 `--podcasts-only`는 해당 키가 없으면 오류로 종료합니다.
- 각 수집기는 독립적으로 처리합니다. 실패·건너뜀 피드는 기존 데이터와 생성 날짜를 보존합니다. 성공한 피드는 다른 수집기의 실패와 관계없이 저장합니다.
- `feed-status.json`과 Actions 요약에 성공·부분 성공·실패·건너뜀을 구분합니다. 전체 실행 성공은 모든 외부 서비스의 복구를 의미하지 않습니다.
- Claude의 새 `/resources/articles` 주소와 기존 `/blog` 주소를 지원하고, 본문에서 확인된 게시일에도 최근 72시간 조건을 적용합니다.

## 실행 방법
저장소 루트에서 `node scripts/generate-feed.js` 또는 `node scripts/generate-feed.js --blogs-only`를 실행합니다. 회귀 시험은 `cd scripts && npm test`입니다.

GitHub Actions의 Generate Feeds에서 Run workflow로 `all`, `blogs-only`, `tweets-only`, `podcasts-only`를 선택할 수 있습니다. 기존 매일 06:17 UTC(한국 15:17) 예약을 유지합니다. GitHub 예약 실행은 지연될 수 있습니다. 수집 코드·설정 변경이 main에 반영되면 시험 후 수집을 실행합니다. PR에서는 외부 서비스 없이 시험만 실행합니다.

## 설정과 연결
- 블로그: Anthropic Engineering, Claude Articles. 공개 HTTP 수집이며 키가 필요 없습니다. 사이트 장애·레이아웃 변경은 별도 오류로 표시합니다.
- X: `X_BEARER_TOKEN`. 코드에서 사용하는 X API v2 사용자 조회와 게시물 조회 권한·한도 확인이 필요합니다.
- 팟캐스트: 공개 RSS로 목록을 읽지만 현재 완성 피드에 필요한 전사문은 pod2txt의 `POD2TXT_API_KEY`가 필요합니다.
- 설정 위치: 저장소 Settings → Secrets and variables → Actions → Repository secrets. 키 값은 문서나 소스에 넣지 않습니다.
- `prepare-digest.js`는 여전히 원본 `zarazhangrui/follow-builders`의 피드와 프롬프트를 읽습니다. 이 포크의 Generate Feeds는 파일 생성·커밋을 담당하며 ChatGPT 브리핑 전송 연결은 구현돼 있지 않습니다.

## 변경 위치
`scripts/generate-feed.js`, `scripts/test/`, `scripts/package.json`, `config/default-sources.json`, `.github/workflows/generate-feed.yml`, `README.md` 및 이 문서·사용설명서·새 이력입니다. 기존 공개 피드와 과거 이력은 수동으로 덮어쓰지 않습니다.

## 남은 작업
수정본을 main에 반영한 뒤 GitHub에서 실제 수집·커밋 성공을 확인해야 합니다. X·팟캐스트 실서비스 인증은 미검증입니다. 해당 기능이 필요하면 키를 설정한 후 단독 모드에서 성공 여부를 확인해야 합니다. 키 발급·결제·이용권 구매는 수행하지 않았습니다.

## 확인 근거
- 10월 8일 실패 실행: https://github.com/sujungwin8-cpu/follow-builders/actions/runs/37784394214
- 10월 9일 실패 실행: https://github.com/sujungwin8-cpu/follow-builders/actions/runs/37935435818
- 변경 전 기준: https://github.com/sujungwin8-cpu/follow-builders/commit/c0576b64eea22e1c38d0b9ace725aa37001dae71
- 로컬 Node.js 24에서 20개 회귀 시험 통과. 키 없는 기본 실행, 단독 모드, 인증 실패, HTTP 실패, 상태·기존 데이터 보존, 중복 제거, Claude 경로·본문·게시일 처리를 검사했습니다. 유료 API 응답은 모의 데이터이므로 실제 인증 성공 근거가 아닙니다.

## 사용설명서
`manual.md`에서 상태 판정과 키 설정 이후 검증 방법을 확인할 수 있습니다.
