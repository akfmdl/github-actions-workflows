# Auto Release by Pull Request

Pull Request 라벨을 기반으로 자동 릴리즈를 수행하는 GitHub Action입니다. 

이 액션은 [semantic-release-pull-request-analyzer](https://github.com/bobvanderlinden/semantic-release-pull-request-analyzer)를 사용하여 commit message 대신 Pull Request의 라벨을 분석해서 semantic versioning과 릴리즈 노트를 자동 생성합니다.

commit message 기반 자동화는 [auto-release-by-commit](../auto-release-by-commit/README.md)를 참고하세요.

## 🏷️ 지원하는 라벨

| 라벨 | 릴리즈 타입 | 설명 |
|------|-------------|------|
| `breaking` | major | 호환성을 깨뜨리는 변경사항 |
| `feature` | minor | 새로운 기능 추가 |
| `enhancement` | minor | 기능 개선 |
| `bug` | patch | 버그 수정 |
| `bugfix` | patch | 버그 수정 |
| `fix` | patch | 수정사항 |
| `documentation` | patch | 문서 변경 |
| `docs` | patch | 문서 변경 |
| `chore` | patch | 기타 변경사항 |

## 📋 필수 조건

1. **Pull Request 머지 방식**: 반드시 "Merge pull request" 방식을 사용해야 합니다 (squash나 rebase 사용 불가)
2. **GitHub Token**: 릴리즈 생성 권한이 있는 토큰 필요
3. **라벨 설정**: Pull Request에 위 표의 라벨 중 하나 이상 설정

## 🚀 사용법

### 1. package.json 파일 확인/생성 (필수)

[auto-release-by-commit](../auto-release-by-commit/README.md)를 참고하세요.

### 2. 워크플로우 파일 생성

`.github/workflows` 에 `release.yml` 파일을 추가하세요:
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

`version.py` 파일을 생성하세요.

참고: [version.py](../../version.py)

```python
__VERSION__ = "0.0.0"
```

### 4. 입력 매개변수

| 파라미터 | 필수 여부 | 기본값 | 설명 |
|----------|-----------|--------|------|
| `token` | ✅ | - | GitHub 토큰 (GITHUB_TOKEN 또는 PAT) |
| `npm_token` | ❌ | - | NPM 토큰 (NPM 패키지 발행시 필요) |
| `working_directory` | ❌ | `.` | 작업 디렉토리 |
| `dry_run` | ❌ | `false` | 드라이런 모드 (실제 릴리즈하지 않음) |

## 💡 사용 팁

1. **라벨 자동 설정**: `.github/labeler.yml`과 `actions/labeler`를 사용하여 파일 변경 패턴에 따라 자동으로 라벨을 설정할 수 있습니다.

2. **릴리즈 노트 커스터마이징**: `.github/release.yml` 파일을 생성하여 GitHub의 자동 생성 릴리즈 노트를 커스터마이징할 수 있습니다.

3. **브랜치 보호**: main 브랜치에 브랜치 보호 규칙을 설정하여 Pull Request를 통해서만 변경사항을 머지하도록 설정하는 것을 권장합니다.

## 🔧 문제 해결

### 릴리즈가 생성되지 않는 경우

1. Pull Request에 지원하는 라벨이 설정되어 있는지 확인
2. 머지 방식이 "Merge pull request"인지 확인 (squash, rebase 사용 불가)
3. GitHub Token에 충분한 권한이 있는지 확인
4. `dry_run: true`로 설정하여 어떤 릴리즈가 생성될지 미리 확인
