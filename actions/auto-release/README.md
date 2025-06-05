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

## Semantic Versioning 이란?

[Semantic Versioning 공식 문서](https://semver.org/)에 따라 버전 관리를 합니다. 버전 관리 규칙은 다음과 같습니다:

```
[Major].[Minor].[Patch]

- Major: 중대한 변경 (예: 새로운 기능, 중요한 버그 수정)
- Minor: 중간 규모의 변경 (예: 새로운 기능, 중요하지 않은 버그 수정)
- Patch: 소규모의 변경 (예: 버그 수정)
```

## 📋 필수 조건

1. **Node.js 프로젝트**여야 합니다 (`package.json` 필요)
2. **Conventional Commits** 규칙을 따라야 합니다:
   - `feat:` - 새로운 기능 (minor 버전 증가)
   - `fix:` - 버그 수정 (patch 버전 증가)
   - `BREAKING CHANGE:` - 호환성을 깨는 변경 (major 버전 증가)

### 📝 package.json 파일 생성

[auto-release-workflow](actions/auto-release) 액션을 사용하면 repository에 `package.json` 파일이 없다면 다음과 같이 생성하세요:

```json
{
    "name": "your-project-name",
    "version": "0.0.0",
    "private": true,
    // 추가로 필요한 의존성 목록
    "devDependencies": {
        "@semantic-release/changelog": "^6.0.3",
        "@semantic-release/git": "^10.0.1"
    },
    // semantic-release 에서 기본으로 제공하는 플러그인 목록
    // 더 많은 플러그인은 https://github.com/semantic-release/semantic-release/blob/master/docs/extending/plugins-list.md 에서 확인할 수 있습니다.
    "release": {
        "plugins": [
            "@semantic-release/commit-analyzer",
            "@semantic-release/release-notes-generator",
            "@semantic-release/changelog",
            [
                "@semantic-release/npm",
                {
                    "npmPublish": false
                }
            ],
            "@semantic-release/github",
            [
                "@semantic-release/git",
                {
                    "assets": [
                        "CHANGELOG.md",
                        "package.json"
                    ],
                    "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
                }
            ]
        ]
    }
}

```

[semantic-release 설정 문서](https://semantic-release.gitbook.io/semantic-release/usage/configuration)에 따라 `package.json`에 더 다양한 설정을 포함할 수도 있습니다.


## 🔧 사용법

### 1. package.json 파일 확인/생성 (필수)

먼저 repository 루트에 `package.json` 파일이 있는지 확인하세요. 없다면 생성해야 합니다.

### 2. 워크플로우 파일 생성

`.github/workflows/release.yml` 파일을 생성하고 다음 내용을 추가하세요:
참고: [examples/auto-release-workflow.yml](../examples/auto-release-workflow.yml)

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
        uses: akfmdl/github-actions-release-tutorial/actions/auto-release@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          node-version: '18'
          release-branches: '["main", "master"]'

      - name: Post-release notification
        if: steps.release.outputs.new-release-published == 'true'
        run: |
          echo "🎉 새로운 릴리즈가 생성되었습니다!"
          echo "버전: ${{ steps.release.outputs.new-release-version }}"
          echo "태그: ${{ steps.release.outputs.new-release-git-tag }}"
          echo "SHA: ${{ steps.release.outputs.new-release-git-head }}" 
```

### 3. 입력 매개변수

| 매개변수 | 필수 | 기본값 | 설명 |
|---------|------|-------|------|
| `github-token` | ✅ | - | GitHub 토큰 (보통 `${{ secrets.GITHUB_TOKEN }}`) |
| `node-version` | ❌ | `'18'` | 사용할 Node.js 버전 |
| `release-branches` | ❌ | `'["main", "master"]'` | 릴리즈할 브랜치 목록 (JSON 배열) |
| `semantic-release-version` | ❌ | `'22'` | 사용할 semantic-release 버전 |
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
