# Auto Release with Semantic Release

특정 브랜치에 push할 때 자동으로 GitHub 릴리즈를 생성하는 GitHub Action입니다.

## 🚀 특징

- **Semantic Release** 버전 관리 자동화
- **Conventional Commits** 커밋 메세지 규칙 기반 릴리즈 노트 자동 생성
- **다중 브랜치** 지원 (main, master, next, beta, alpha 등)
- **CHANGELOG.md** 자동 생성 및 업데이트
- **GitHub 릴리즈** 자동 생성
- **Dry-run** 모드 지원
- **버전 고정**: 특정 semantic-release 버전 사용 가능
- **유연한 설치**: npx를 통한 효율적인 의존성 관리

## 📋 필수 조건

1. **Node.js 프로젝트**여야 합니다 (`package.json` 필요)
2. **Conventional Commits** 규칙을 따라야 합니다:
   - `feat:` - 새로운 기능 (minor 버전 증가)
   - `fix:` - 버그 수정 (patch 버전 증가)
   - `BREAKING CHANGE:` - 호환성을 깨는 변경 (major 버전 증가)

## 🔧 사용법

### 1. package.json 파일 확인/생성 (필수)

먼저 repository 루트에 `package.json` 파일이 있는지 확인하세요. 없다면 생성해야 합니다.

참고: [package.json](../../package.json)

[semantic-release 설정 문서](https://semantic-release.gitbook.io/semantic-release/usage/configuration)에 따라 `package.json`에 더 다양한 설정을 포함할 수도 있습니다.

### 2. 워크플로우 파일 생성

`.github/workflows` 에 `release.yml` 파일을 추가하세요:
참고: [.github/workflows/release.yml](../../.github/workflows/release.yml)

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


### 3. 입력 매개변수

| 매개변수 | 필수 | 기본값 | 설명 |
|---------|------|-------|------|
| `github-token` | ✅ | - | GitHub 토큰 (보통 `${{ secrets.GITHUB_TOKEN }}`) |
| `node-version` | ❌ | `'18'` | 사용할 Node.js 버전 |
| `release-branches` | ❌ | `'["main", "master"]'` | 릴리즈할 브랜치 목록 (JSON 배열) |
| `dry-run` | ❌ | `'false'` | 테스트 모드 실행 여부 |
| `working-directory` | ❌ | `'.'` | 작업 디렉토리 |
| `semantic-release-version` | ❌ | `'22'` | 사용할 semantic-release 버전 |

### 4. 출력 값

| 출력 | 설명 |
|------|------|
| `new-release-published` | 새 릴리즈 생성 여부 (true/false) |
| `new-release-version` | 새 릴리즈 버전 |
| `new-release-git-tag` | 새 릴리즈 Git 태그 |
| `new-release-git-head` | 새 릴리즈 Git SHA |

## 📝 Conventional Commits 예시
[Conventional Commits 규칙](https://www.conventionalcommits.org/)을 따라 커밋 메시지를 작성합니다:

```bash
# Patch 릴리즈 (1.0.0 → 1.0.1)
git commit -m "fix: 로그인 버그 수정"

# Minor 릴리즈 (1.0.0 → 1.1.0)
git commit -m "feat: 새로운 검색 기능 추가"

# Major 릴리즈 (1.0.0 → 2.0.0): commit message 내에 BREAKING CHANGE: 라는 footer가 포함되어 있으면 적용됨
git commit -m "feat: API 구조 변경

BREAKING CHANGE: /api/v1 엔드포인트가 /api/v2로 변경됨"
```

## 🔧 고급 설정

### 사용자 정의 설정 파일

프로젝트 루트에 `.releaserc.js` 파일을 생성하여 semantic-release 설정을 커스터마이징할 수 있습니다:

```javascript
module.exports = {
  branches: ['main', 'next', { name: 'beta', prerelease: true }],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/github',
    '@semantic-release/git'
  ]
}
```

## 📚 참고 자료

- [Semantic Release 공식 문서](https://semantic-release.gitbook.io/semantic-release)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions 복합 액션](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action)
