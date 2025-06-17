# Docker Build, Push and Update Repository Action

이 GitHub Action은 Docker 이미지를 빌드하고 레지스트리에 푸시한 후, 다른 레포지토리의 YAML 파일에서 이미지 태그를 자동으로 업데이트합니다.

## 📋 필수 조건

1. **Node.js 프로젝트**여야 합니다 (`package.json` 필요)

## 🚀 기능

- **Docker 이미지 빌드**: Dockerfile을 이용해 이미지 빌드
- **레지스트리 푸시**: 다양한 Container Registry(ACR, Docker Hub, GCR, ECR 등)에 푸시
- **유연한 태그 지정**: 사용자가 직접 지정한 이미지 태그 사용 (v1.0.0, 2025.01.15.1430 등)
- **크로스 레포지토리 업데이트**: 다른 레포지토리의 Kubernetes 매니페스트 파일 자동 업데이트
- **즉시 배포**: Pull Request 없이 바로 push하여 즉시 반영

## 📋 사용법

### 1. package.json 파일 확인/생성 (필수)

repository 루트에 `package.json` 파일을 추가하세요. 아래 예시 파일을 copy & paste 하세요.

* [package.json](./package.json)

### 2. 워크플로우 파일 생성

`.github/workflows` 에 `docker-build-and-update.yml` 파일을 추가하세요. 아래 예시 파일을 copy & paste 하세요.

* [.github/workflows/docker-build-and-update.yml](../../.github/workflows/docker-build-and-update.yml)

## 🔐 필수 GitHub Secrets

다음 secrets을 GitHub 레포지토리에 설정해야 합니다:

```
REGISTRY_USERNAME=<Container Registry 사용자명>
REGISTRY_PASSWORD=<Container Registry 패스워드>
GITHUB_TOKEN=<GitHub Personal Access Token> (자동 제공됨)
```

## 📢 Microsoft Teams 알림 설정

Teams 알림을 사용하려면 다음 단계를 따르세요:

1. **Power Automate에서 Teams Workflow 생성**:
   - Power Automate (flow.microsoft.com) 접속
   - "새로 만들기" → "인스턴트 클라우드 플로우"
   - 트리거: "HTTP 요청을 받은 경우" 선택
   - 액션 추가: "적용 대상" (Apply to each) → 입력값: `@triggerOutputs()?['body']?['attachments']`
   - 액션 내부에 "적응형 카드 게시" (Post adaptive card) 추가
   - 카드: `@item()?['content']`

2. **GitHub Secrets 추가**:
   - 레포지토리 Settings → Secrets and variables → Actions
   - `TEAMS_WORKFLOWS_URL`에 복사한 Power Automate Workflow URL 추가

3. **알림 기능**:
   - 🚀 **배포 시작**: "Stage 배포 중입니다. @개발팀" (새 메시지)
   - ✅ **배포 완료**: "Stage 배포 완료했습니다. @개발팀" (새 메시지)
   - ❌ **배포 실패**: "Stage 배포 실패했습니다. @개발팀" (새 메시지)


## 📝 입력값 (Inputs)

| 입력값 | 설명 | 필수 | 기본값 |
|--------|------|------|--------|
| `github-token` | GitHub Personal Access Token | ✅ | - |
| `image-name` | Docker 이미지 이름 | ✅ | - |
| `image-tag` | Docker 이미지 태그 | ✅ | - |
| `target-repo` | 대상 레포지토리 (owner/repo) | ✅ | - |
| `target-file-path` | 업데이트할 파일 경로 | ✅ | - |
| `target-branch` | 대상 브랜치 (미지정시 기본 브랜치) | ❌ | - |
| `docker-registry` | Docker 레지스트리 URL | ❌ | `***.azurecr.io` |
| `dockerfile-path` | Dockerfile 경로 | ❌ | `./Dockerfile` |
| `build-context` | 빌드 컨텍스트 | ❌ | `.` |
| `build-args` | Docker build arguments (KEY=VALUE,KEY2=VALUE2) | ❌ | - |
| `registry-username` | Container Registry 사용자명 | ❌ | - |
| `registry-password` | Container Registry 패스워드 | ❌ | - |
| `commit-message` | 커밋 메시지 | ❌ | 자동 생성 |

## 📤 출력값 (Outputs)

| 출력값 | 설명 |
|--------|------|
| `image-tag` | 생성된 이미지 태그 |
| `full-image-name` | 전체 이미지 이름 (registry/image:tag) |
| `updated-file` | 업데이트된 파일 경로 |
| `commit-message` | 커밋 메시지 |

## 🔧 출력값 사용 예시

```yaml
- name: Docker Build and Update
  id: docker-build
  uses: akfmdl/github-actions-workflows/actions/docker-build-and-update@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    image-name: <IMAGE_NAME>
    image-tag: 'v2.1.0'
    target-repo: 'owner/k8s-manifests'
    target-file-path: 'deployment.yaml'

- name: Show Results
  run: |
    echo "이미지 태그: ${{ steps.docker-build.outputs.image-tag }}"
    echo "전체 이미지명: ${{ steps.docker-build.outputs.full-image-name }}"
    echo "업데이트된 파일: ${{ steps.docker-build.outputs.updated-file }}"
```

## 🎯 실제 사용 시나리오

### 1. 기본 사용법

```yaml
- name: Build and Deploy
  uses: akfmdl/github-actions-workflows/actions/docker-build-and-update@main
  with:
    github-token: ${{ secrets.GIT_TOKEN }}
    image-name: '<IMAGE_NAME>'
    image-tag: '<IMAGE_TAG>'
    target-repo: '<TARGET_REPO>'
    target-file-path: 'values.yaml'
    target-branch: 'main'  # 기본 브랜치에 직접 push
    registry-username: ${{ secrets.REGISTRY_USERNAME }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
```

### 2. 커스텀 설정

```yaml
- name: Build and Deploy with Custom Settings
  uses: akfmdl/github-actions-workflows/actions/docker-build-and-update@main
  with:
    github-token: ${{ secrets.GIT_TOKEN }}
    docker-registry: '<DOCKER_REGISTRY>'
    image-name: '<IMAGE_NAME>'
    image-tag: '<IMAGE_TAG>'
    dockerfile-path: './docker/Dockerfile'
    build-context: './src'
    build-args: 'NODE_ENV=production,APP_VERSION=1.0.0,DEBUG=false'
    target-repo: '<TARGET_REPO>'
    target-file-path: '<TARGET_FILE_PATH>'
    target-branch: '<TARGET_BRANCH>'  # staging 브랜치에 배포
    commit-message: '🚀 Deploy <IMAGE_NAME> with new features'
    registry-username: ${{ secrets.REGISTRY_USERNAME }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
```

### 3. Build Arguments 사용 예시

Docker build시 필요한 arguments를 쉼표로 구분하여 전달할 수 있습니다:

```yaml
- name: Build with Build Arguments
  uses: akfmdl/github-actions-workflows/actions/docker-build-and-update@main
  with:
    github-token: ${{ secrets.GIT_TOKEN }}
    image-name: 'my-app'
    image-tag: 'v1.0.0'
    build-args: 'NODE_ENV=production,APP_VERSION=${{ github.sha }},BUILD_DATE=${{ github.event.head_commit.timestamp }}'
    target-repo: 'owner/k8s-manifests'
    target-file-path: 'deployment.yaml'
```

**Build Arguments 형식:**
- `KEY=VALUE` 형식으로 각 argument 작성
- 여러 개는 쉼표(`,`)로 구분
- 예: `NODE_ENV=production,DEBUG=false,PORT=3000`

## 🔍 지원하는 파일 형식

현재 YAML/YML 파일의 `image:` 필드를 업데이트합니다:

```yaml
# 업데이트 전
containers:
- name: app
  image: ***.azurecr.io/<IMAGE_NAME>:2025.06.0.2

# 업데이트 후  
containers:
- name: app
  image: ***.azurecr.io/<IMAGE_NAME>:<IMAGE_TAG>
```

## 🛡️ 필수 권한

GitHub Token에는 다음 권한이 필요합니다:
- `contents:write` - 파일 수정용
- `actions:read` - 워크플로우 정보 읽기용

## 🔄 워크플로우 과정

1. **환경 설정**: Node.js 및 Docker Buildx 설정
2. **스크립트 다운로드**: 최신 빌드 스크립트 다운로드
3. **Docker 빌드**: 이미지 빌드 및 레지스트리 푸시
4. **파일 업데이트**: 대상 레포지토리의 YAML 파일 직접 수정
5. **결과 출력**: 성공 상태 및 결과 정보 출력 

## 🎨 Teams 메시지 추가

### 📝 Teams 메시지 JSON 예시

* [teams_message_start.json](./teams_message_start.json)
* [teams_message_complete.json](./teams_message_complete.json)

### Action에서 사용하기 예시

* [.github/workflows/docker-build-and-update.yml](../../.github/workflows/docker-build-and-update.yml)

### Action에서 Teams 메시지에 release note 추가

1. [teams_message_complete.json](./teams_message_complete.json)에 block 추가
```json
{
    "type": "message",
    "attachments": [
        {
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.json/schema/adaptive-card/1.5",
                "type": "AdaptiveCard",
                "body": [
                    ...(기존 메시지 내용)
                    {
                        "type": "TextBlock",
                        "text": "📝 릴리즈 노트",
                        "weight": "Bolder",
                        "wrap": true
                    },
                    {
                        "type": "TextBlock",
                        "text": "${RELEASE_NOTES}",
                        "wrap": true
                    }
                ]
            }
        }
    ]
}
```

2. action에 아래와 같이 [scripts/process_teams_template.py](../../scripts/process_teams_template.py) 를 이용하여 release 노트를 teams용으로 변환
```yaml
          
          # Python으로 Teams JSON 템플릿 처리 (안전한 JSON 생성)
          echo "🐍 Python으로 Teams JSON 처리 중..."
          
          # Python 스크립트로 Teams JSON 생성 (argparse 방식)
          if [ -f "scripts/teams_message_start.json" ]; then
            TEAMS_START_JSON=$(python3 scripts/process_teams_template.py \
              scripts/teams_message_start.json \
              --image-info "${IMAGE_INFO}" \
              --repo-info "${REPO_INFO}"
            echo "📝 Python으로 Teams JSON 생성 완료"
          else
            echo "⚠️ Teams 템플릿 파일이 없습니다: scripts/teams_message_start.json"
            TEAMS_START_JSON='{"type": "message", "text": "Teams 템플릿을 찾을 수 없습니다."}'
          fi
```