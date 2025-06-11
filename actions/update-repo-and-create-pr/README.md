# Update Repository File and Create PR

다른 레포지토리의 파일을 수정하고 Pull Request를 자동으로 생성하는 GitHub Action입니다.

## 📋 필수 조건

1. **Node.js 프로젝트**여야 합니다 (`package.json` 필요)

## 🔧 사용법

### 1. package.json 파일 확인/생성 (필수)

repository 루트에 `package.json` 파일을 추가하세요. 아래 예시 파일을 copy & paste 하세요.

* [package.json](./package.json)

### 2. 워크플로우 파일 생성

`.github/workflows` 에 `release.yml` 파일을 추가하세요. 아래 예시 파일을 copy & paste 하세요.

* [.github/workflows/update-repo-and-create-pr.yml](../../.github/workflows/update-repo-and-create-pr.yml)

#### 지원 파일 형식
- **Makefile**: `VARIABLE=value` 또는 `VARIABLE?=value`
- **JSON**: 중첩 객체 지원 (`package.version` 등)
- **YAML/YML**: `key: value` 형식
- **Python**: `VARIABLE = "value"` 형식
- **환경변수 파일**: `.env` 파일의 `VARIABLE=value`
- **일반 텍스트**: `variable=value` 또는 `variable: value`

#### 입력 파라미터
- `github-token` (필수): GitHub Personal Access Token
- `target-repo` (필수): 수정할 대상 레포지토리
- `file-path` (필수): 수정할 파일 경로
- `variable-name` (필수): 수정할 변수명
- `new-value` (필수): 새로운 값
- `commit-message` (선택): 커밋 메시지
- `pr-title` (선택): Pull Request 제목
- `pr-body` (선택): Pull Request 본문
- `node-version` (선택): Node.js 버전
- `working-directory` (선택): 작업 디렉토리
- `release-version` (선택): 현재 레포지토리의 릴리즈 버전

#### 출력값
- `pr-url`: 생성된 Pull Request URL
- `pr-number`: 생성된 Pull Request 번호
- `branch-name`: 생성된 브랜치 이름