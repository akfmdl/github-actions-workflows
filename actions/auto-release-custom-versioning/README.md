# Auto Release with Custom Versioning

특정 브랜치에 push할 때 Custom 버전 규칙에 따라 자동으로 GitHub 릴리즈를 생성하는 GitHub Action입니다.

## 📋 필수 조건

1. **Node.js 프로젝트**여야 합니다 (`package.json` 필요)
2. **Pull Request 라벨** Pull Request에 [scripts/calendar-version-wrapper.js](../../scripts/calendar-version-wrapper.js) 파일에 등록된 라벨을 추가해야 합니다. 더 많은 라벨을 추가하고 싶다면 해당 파일을 수정하세요.

[예시]
```json
const DEFAULT_LABEL_MAPPINGS = {
    // "등록된 라벨 이름": "버전 증가 단위"
    "breaking": "minor",
    "feature": "minor",
    "enhancement": "minor",
    "bug": "patch",
    "bugfix": "patch",
    "fix": "patch",
    "documentation": "patch",
    "docs": "patch",
    "chore": "patch"
};
```

## 🔧 사용법

### 1. package.json 파일 확인/생성 (필수)

repository 루트에 `package.json` 파일을 추가하세요. 아래 예시 파일을 copy & paste 하세요.

#### Calendar Versioning 버전 규칙 기반 릴리즈 노트 자동 생성
* [package.json](./package-by-calendar-versioning.json): Pull Request 라벨 규칙 기반으로 Year.Month.Minor.Fix 형식으로 버전 관리 및 릴리즈 노트 자동 생성

### 2. 워크플로우 파일 생성

`.github/workflows` 에 `release.yml` 파일을 추가하세요. 아래 예시 파일을 copy & paste 하세요.

#### Calendar Versioning 버전 규칙 기반 릴리즈 노트 자동 생성
참고: [.github/workflows/auto-release-by-pull-request.yml](../../.github/workflows/auto-release-by-pull-request.yml)

target branch를 원하는 브랜치로 변경하세요. 여러 브랜치 지원 가능합니다.

```yaml
on:
  push:
    branches:
      - <target branch>

    steps:
      - name: Auto Release
          ...
          release-branches: '["<target branch>"]'
```

### 3. (옵션) 버전 관리 파일 생성

`version.py` 파일을 생성하세요. package.json와 함께 업데이트 해야 할 파일이 있을 경우, 해당 파일을 추가하세요.
기본 경로는 `<repository root>/version.py` 입니다.

참고: [version.py](../../version.py)

```python
__VERSION__ = "0.0.0"
```

경로가 변경되었다면, 워크플로우 파일에서 경로를 수정하세요.

```yaml
    steps:
      - name: Auto Release
        ...
        with:
          ...
          version-py-path: 'src/version.py'  # 선택사항: version.py 파일 경로
```

### 4. 입력 매개변수

| 매개변수 | 필수 | 기본값 | 설명 |
|---------|------|-------|------|
| `github-token` | ✅ | - | GitHub 토큰 (보통 `${{ secrets.GITHUB_TOKEN }}`) |
| `node-version` | ❌ | `'18'` | 사용할 Node.js 버전 |
| `release-branches` | ❌ | `'["main", "master"]'` | 릴리즈할 브랜치 목록 (JSON 배열) |
| `dry-run` | ❌ | `'false'` | 테스트 모드 실행 여부 |
| `working-directory` | ❌ | `'.'` | 작업 디렉토리 |
| `jira-base-url` | ❌ | `'https://your-jira-instance.atlassian.net'` | Jira 인스턴스 URL |
| `version-py-path` | ❌ | `''` | version.py 파일의 경로 (예: `src/version.py`, `app/version.py`)
  - 지정하지 않으면 루트 디렉토리의 `version.py`를 찾습니다
  - 파일이 없으면 건너뜁니다

### 5. 출력 값

| 출력 | 설명 |
|------|------|
| `new-release-published` | 새 릴리즈 생성 여부 (true/false) |
| `new-release-version` | 새 릴리즈 버전 |
| `new-release-git-tag` | 새 릴리즈 Git 태그 |
| `new-release-git-head` | 새 릴리즈 Git SHA |
