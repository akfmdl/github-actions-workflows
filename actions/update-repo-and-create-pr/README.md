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
- **Dockerfile**: `ARG VARIABLE=value`, `ENV VARIABLE=value`, `ENV VARIABLE value`
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

### 3. 파일 수정 예시

### 📁 Makefile 사용 예시

Makefile의 변수를 수정하는 경우:

```makefile
# 수정 대상 파일 (Makefile)
VERSION=1.0.0
NODE_VERSION?=18
APP_NAME=myapp
```

```yaml
# 워크플로우 설정
- name: Update Makefile
  uses: akfmdl/github-actions-workflows/actions/update-repo-and-create-pr@main
  with:
    target-repo: akfmdl/mlops-lifecycle
    file-path: Makefile
    variable-name: VERSION
    new-value: 2025.06.0.0
    github-token: ${{ secrets.GIT_TOKEN }}
    release-version: 2025.06.0.0
```

### 📄 JSON 사용 예시

JSON 파일의 값을 수정하는 경우 (중첩 객체 지원):

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "config": {
    "dubbing": {
      "version": "1.0.0"
    }
  }
}
```

```yaml
# 워크플로우 설정
- name: Update package.json
  uses: akfmdl/github-actions-workflows/actions/update-repo-and-create-pr@main
  with:
    target-repo: akfmdl/mlops-lifecycle
    file-path: package.json
    variable-name: config.dubbing.version    # 중첩 객체 지원
    new-value: 2025.06.0.0
    github-token: ${{ secrets.GIT_TOKEN }}
```

### 📋 YAML 사용 예시

YAML/YML 파일의 값을 수정하는 경우:

```yaml
# 수정 대상 파일 (config.yml)
app:
  name: my-app
  version: 1.0.0
VERSION: 1.0.0
```

```yaml
# 워크플로우 설정
- name: Update YAML config
  uses: akfmdl/github-actions-workflows/actions/update-repo-and-create-pr@main
  with:
    target-repo: akfmdl/mlops-lifecycle
    file-path: config.yml
    variable-name: VERSION
    new-value: 2025.06.0.0
    github-token: ${{ secrets.GIT_TOKEN }}
```

### 🐍 Python 사용 예시

Python 파일의 변수를 수정하는 경우:

```python
# 수정 대상 파일 (config.py)
VERSION = "1.0.0"
APP_NAME = "my-app"
DEBUG = True
```

```yaml
# 워크플로우 설정
- name: Update Python config
  uses: akfmdl/github-actions-workflows/actions/update-repo-and-create-pr@main
  with:
    target-repo: akfmdl/mlops-lifecycle
    file-path: config.py
    variable-name: VERSION
    new-value: 2025.06.0.0
    github-token: ${{ secrets.GIT_TOKEN }}
```

### 🐳 Dockerfile 사용 예시

Dockerfile의 ARG나 ENV 변수를 수정하는 경우:

```dockerfile
# 수정 대상 파일 (Dockerfile)
ARG VERSION=latest
ENV NODE_VERSION=18
ENV APP_PORT 3000
```

```yaml
# 워크플로우 설정
- name: Update Dockerfile
  uses: akfmdl/github-actions-workflows/actions/update-repo-and-create-pr@main
  with:
    target-repo: akfmdl/mlops-lifecycle
    file-path: Dockerfile
    variable-name: VERSION    # ARG나 ENV 변수명
    new-value: 2025.06.0.0           # 새로운 값
    github-token: ${{ secrets.GIT_TOKEN }}
    release-version: 2025.06.0.0    # 릴리즈 버전 (선택사항)
```

**지원하는 Dockerfile 형식:**
- `ARG VARIABLE=value` → `ARG VARIABLE=새값`
- `ENV VARIABLE=value` → `ENV VARIABLE=새값`  
- `ENV VARIABLE value` → `ENV VARIABLE 새값`

**파일 감지 조건:**
- 파일명이 정확히 `Dockerfile`
- 파일명이 `.dockerfile`로 끝남
- 파일명에 `Dockerfile`이 포함됨 (예: `Dockerfile.prod`)

### 🌍 환경변수 파일 사용 예시

`.env` 파일의 환경변수를 수정하는 경우:

```bash
# 수정 대상 파일 (.env)
NODE_ENV=development
VERSION=1.0.0
API_URL=https://api.example.com
DEBUG=true
```

```yaml
# 워크플로우 설정
- name: Update .env file
  uses: akfmdl/github-actions-workflows/actions/update-repo-and-create-pr@main
  with:
    target-repo: akfmdl/mlops-lifecycle
    file-path: .env
    variable-name: VERSION
    new-value: 2025.06.0.0
    github-token: ${{ secrets.GIT_TOKEN }}
```

### 📝 일반 텍스트 파일 사용 예시

일반 텍스트 파일의 변수를 수정하는 경우:

```text
# 수정 대상 파일 (config.txt)
VERSION=1.0.0
app_name: my-application
database_host=localhost
port: 3000
```

```yaml
# 워크플로우 설정
- name: Update text config
  uses: akfmdl/github-actions-workflows/actions/update-repo-and-create-pr@main
  with:
    target-repo: akfmdl/mlops-lifecycle
    file-path: config.txt
    variable-name: VERSION    # = 또는 : 형식 모두 지원
    new-value: 2025.06.0.0
    github-token: ${{ secrets.GIT_TOKEN }}
```

**지원하는 일반 텍스트 형식:**
- `variable=value` → `variable=새값`
- `variable: value` → `variable: 새값`