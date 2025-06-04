# GitHub Actions 자동 릴리즈 액션

특정 브랜치에 push할 때 자동으로 GitHub 릴리즈를 생성하는 **재사용 가능한 GitHub Action**입니다.

## 🚀 특징

- **Semantic Release** 기반 자동 버전 관리
- **Conventional Commits** 기반 릴리즈 노트 자동 생성
- **다중 브랜치** 지원 (main, master, next, beta, alpha 등)
- **CHANGELOG.md** 자동 생성 및 업데이트
- **GitHub 릴리즈** 자동 생성
- **NPM 패키지** 배포 지원 (선택사항)
- **Dry-run** 모드 지원
- **버전 고정**: 특정 semantic-release 버전 사용 가능
- **자동 감지**: package.json 설정 또는 설정 파일 자동 감지
- **유연한 설치**: npx를 통한 효율적인 의존성 관리

## 📋 필수 조건

1. **Node.js 프로젝트**여야 합니다 (`package.json` 필요)
2. **Conventional Commits** 규칙을 따라야 합니다:
   - `feat:` - 새로운 기능 (minor 버전 증가)
   - `fix:` - 버그 수정 (patch 버전 증가)
   - `BREAKING CHANGE:` - 호환성을 깨는 변경 (major 버전 증가)

### 📝 package.json 파일 생성

repository에 `package.json` 파일이 없다면 다음과 같이 생성하세요:

```json
{
  "name": "your-project-name",
  "version": "0.0.0",
  "description": "Your project description",
  "private": true,
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/your-repo.git"
  },
  "author": "Your Name",
  "license": "MIT"
}
```

> **중요**: `version`을 `"0.0.0"`으로 설정하면 첫 번째 릴리즈부터 시작됩니다.

### 🔧 고급 package.json 설정 (권장)

[semantic-release 설정 문서](https://semantic-release.gitbook.io/semantic-release/usage/configuration)에 따라 `package.json`에 직접 설정을 포함할 수도 있습니다:

```json
{
  "name": "your-project-name",
  "version": "0.0.0",
  "description": "Your project description",
  "private": true,
  "scripts": {
    "semantic-release": "semantic-release",
    "semantic-release:dry-run": "semantic-release --dry-run"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/your-repo.git"
  },
  "keywords": ["semantic-release", "github-actions", "automation"],
  "author": "Your Name",
  "license": "MIT",
  "release": {
    "branches": [
      "+([0-9])?(.{+([0-9]),x}).x",
      "master",
      "main", 
      "next",
      "next-major",
      {"name": "beta", "prerelease": true},
      {"name": "alpha", "prerelease": true}
    ],
    "plugins": [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator", 
      "@semantic-release/changelog",
      ["@semantic-release/npm", {"npmPublish": false}],
      ["@semantic-release/github", {"assets": ["CHANGELOG.md"]}],
      ["@semantic-release/git", {
        "assets": ["CHANGELOG.md", "package.json", "package-lock.json"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }]
    ]
  },
  "devDependencies": {
    "semantic-release": "^22.0.0",
    "@semantic-release/changelog": "^6.0.0",
    "@semantic-release/commit-analyzer": "^11.0.0",
    "@semantic-release/git": "^10.0.0", 
    "@semantic-release/github": "^9.0.0",
    "@semantic-release/npm": "^11.0.0",
    "@semantic-release/release-notes-generator": "^12.0.0"
  }
}
```

#### 🎯 고급 설정의 장점:
- **로컬 테스트**: `npm run semantic-release:dry-run`으로 로컬에서 테스트 가능
- **유지보수 브랜치**: `1.x.x`, `2.x.x` 등 자동 지원
- **Pre-release**: `beta`, `alpha` 브랜치에서 사전 릴리즈 생성
- **CHANGELOG**: 자동 생성 및 Git 커밋에 포함
- **버전 관리**: 프로젝트별 설정으로 일관성 보장

## 🔧 사용법

### 1. package.json 파일 확인/생성 (필수)

먼저 repository 루트에 `package.json` 파일이 있는지 확인하세요. 없다면 생성해야 합니다:

```bash
# 터미널에서 실행 (기본값으로 생성)
npm init -y

# 또는 수동으로 파일 생성
```

**최소 구성 예시**:
```json
{
  "name": "your-project-name",
  "version": "0.0.0",
  "private": true,
  "repository": {
    "type": "git", 
    "url": "https://github.com/your-username/your-repo.git"
  }
}
```

> 💡 **팁**: `version`을 `"0.0.0"`으로 설정하면 첫 번째 릴리즈부터 시작됩니다.

### 2. 워크플로우 파일 생성

`.github/workflows/release.yml` 파일을 생성하고 다음 내용을 추가하세요:

```yaml
name: Auto Release

on:
  push:
    branches:
      - main
      - master

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
      id-token: write

    steps:
      - name: Auto Release
        uses: your-username/your-repo/actions/auto-release@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          node-version: '18'
          release-branches: '["main", "master"]'
```

### 3. 입력 매개변수

| 매개변수 | 필수 | 기본값 | 설명 |
|---------|------|-------|------|
| `github-token` | ✅ | - | GitHub 토큰 (보통 `${{ secrets.GITHUB_TOKEN }}`) |
| `node-version` | ❌ | `'18'` | 사용할 Node.js 버전 |
| `release-branches` | ❌ | `'["main", "master"]'` | 릴리즈할 브랜치 목록 (JSON 배열) |
| `semantic-release-version` | ❌ | `'22'` | 사용할 semantic-release 버전 |
| `npm-token` | ❌ | `''` | NPM 패키지 배포용 토큰 |
| `dry-run` | ❌ | `'false'` | 테스트 모드 실행 여부 |
| `working-directory` | ❌ | `'.'` | 작업 디렉토리 |

> 💡 **새로운 기능**: [semantic-release 설치 문서](https://semantic-release.gitbook.io/semantic-release/usage/installation#installation)에 따라 `npx`를 직접 사용하여 더 안정적이고 빠른 설치가 가능합니다.

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

### NPM 패키지 배포

NPM 패키지도 함께 배포하려면:

1. NPM 토큰을 생성하고 GitHub Secrets에 `NPM_TOKEN`으로 추가
2. 워크플로우에서 `npm-token` 매개변수 추가:

```yaml
- name: Auto Release
  uses: your-username/your-repo/actions/auto-release@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    npm-token: ${{ secrets.NPM_TOKEN }}
```

## 📚 참고 자료

- [Semantic Release 공식 문서](https://semantic-release.gitbook.io/semantic-release)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions 복합 액션](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action)
