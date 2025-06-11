# Docker Build & Push + Repository Update Workflow

이 워크플로우는 현재 레포지토리의 Dockerfile을 빌드하고 Azure Container Registry에 푸시한 후, 다른 레포지토리의 Kubernetes 매니페스트 파일에서 이미지 태그를 자동으로 업데이트합니다.

## 🚀 주요 기능

- **Docker 이미지 빌드 및 푸시**: Dockerfile을 빌드하고 ACR에 푸시
- **자동 버전 태그 생성**: 캘린더 버전 형식 (YYYY.MM.DD.HHMM)
- **크로스 레포지토리 업데이트**: 다른 레포지토리의 YAML 파일 자동 업데이트
- **Pull Request 자동 생성**: 변경사항에 대한 PR 자동 생성

## 📋 필수 환경변수 및 시크릿

### GitHub Secrets
```
ACR_USERNAME=<Azure Container Registry 사용자명>
ACR_PASSWORD=<Azure Container Registry 패스워드>
GITHUB_TOKEN=<GitHub Personal Access Token> (자동 제공됨)
```

### 환경변수
```bash
IMAGE_NAME=audio-engine-server                    # Docker 이미지 이름
TARGET_REPO=owner/k8s-manifests-repo              # 대상 레포지토리
TARGET_FILE_PATH=stg-idc/.../deployment.yaml      # 업데이트할 파일 경로
DOCKER_REGISTRY=persolive.azurecr.io              # Docker 레지스트리 (선택사항)
DOCKERFILE_PATH=./Dockerfile                       # Dockerfile 경로 (선택사항)
BUILD_CONTEXT=.                                    # 빌드 컨텍스트 (선택사항)
```

## 🛠 사용법

### 1. 자동 실행 (Push 이벤트)

특정 파일이 변경되면 자동으로 실행됩니다:
- `Dockerfile`
- `src/**`
- `app/**`
- `package.json`
- `requirements.txt`

```yaml
# .github/workflows/docker-build-and-update.yml 에서 설정 수정
env:
  DOCKER_REGISTRY: persolive.azurecr.io

jobs:
  docker-build-and-update:
    steps:
    - name: Configure environment variables
      run: |
        # 기본값들 설정 (실제 사용시 환경에 맞게 수정)
        echo "TARGET_REPO=your-org/k8s-manifests" >> $GITHUB_ENV
        echo "TARGET_FILE_PATH=path/to/your/deployment.yaml" >> $GITHUB_ENV
```

### 2. 수동 실행 (workflow_dispatch)

GitHub Actions 탭에서 "Run workflow" 버튼을 클릭하고 필요한 정보를 입력합니다:

- **image_name**: `audio-engine-server`
- **target_repo**: `owner/k8s-manifests`
- **target_file_path**: `stg-idc/02-perso-vt/01-perso-vt-audio/01-perso-vt-audio-engine/perso-vt-audio-engine-stg.yaml`
- **dockerfile_path**: `./Dockerfile` (선택사항)
- **build_context**: `.` (선택사항)

### 3. 직접 스크립트 실행

```bash
# 환경변수 설정
export IMAGE_NAME="audio-engine-server"
export TARGET_REPO="owner/k8s-manifests"  
export TARGET_FILE_PATH="stg-idc/02-perso-vt/01-perso-vt-audio/01-perso-vt-audio-engine/perso-vt-audio-engine-stg.yaml"
export GITHUB_TOKEN="your-github-token"
export ACR_USERNAME="your-acr-username"
export ACR_PASSWORD="your-acr-password"

# 스크립트 실행
node scripts/docker-build-push-update.js
```

## 📝 예시 시나리오

### 시나리오: audio-engine-server 이미지 업데이트

1. **현재 상황**:
   ```yaml
   # perso-vt-audio-engine-stg.yaml
   containers:
     - name: perso-vt-audio-engine-stg
       image: persolive.azurecr.io/audio-engine-server:2025.06.0.2
   ```

2. **워크플로우 실행 후**:
   ```yaml
   # perso-vt-audio-engine-stg.yaml  
   containers:
     - name: perso-vt-audio-engine-stg
       image: persolive.azurecr.io/audio-engine-server:2025.01.15.1430
   ```

3. **결과**:
   - 새로운 이미지가 ACR에 푸시됨
   - k8s-manifests 레포지토리에 새 브랜치 생성
   - Pull Request 자동 생성

## 🔧 지원하는 파일 형식

현재 YAML/YML 파일의 `image:` 필드 업데이트를 지원합니다:

```yaml
# 지원하는 패턴들
containers:
  - image: registry.io/image-name:tag
  - name: container-name
    image: registry.io/image-name:tag

spec:
  template:
    spec:
      containers:
        - image: registry.io/image-name:tag
```

## 🎯 버전 태그 형식

캘린더 버전 형식을 사용합니다:
- **형식**: `YYYY.MM.DD.HHMM`
- **예시**: `2025.01.15.1430` (2025년 1월 15일 14시 30분)

## 🔍 트러블슈팅

### 1. Docker 빌드 실패
```bash
# Docker 데몬 확인
docker info

# Dockerfile 경로 확인
ls -la Dockerfile
```

### 2. ACR 로그인 실패
```bash
# 인증 정보 확인
echo $ACR_USERNAME
echo $ACR_PASSWORD

# 수동 로그인 테스트
docker login persolive.azurecr.io -u $ACR_USERNAME -p $ACR_PASSWORD
```

### 3. GitHub API 에러
```bash
# 토큰 권한 확인 (contents:write, pull_requests:write 필요)
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

# 대상 레포지토리 접근 권한 확인
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/owner/repo
```

### 4. 이미지 패턴 매칭 실패
```bash
# 파일에서 현재 이미지 패턴 확인
grep -n "image:" target-file.yaml

# 레지스트리와 이미지명 확인
echo "Registry: $DOCKER_REGISTRY"
echo "Image: $IMAGE_NAME"
```

## 📚 추가 정보

- 스크립트는 기존 스크립트들과 동일한 패턴을 따름
- GitHub API v4 사용
- Node.js 네이티브 fetch API 사용
- 에러 핸들링 및 로깅 포함

## 🔄 워크플로우 순서

1. **환경 검증**: 필수 환경변수 확인
2. **버전 생성**: 캘린더 버전 태그 생성
3. **Docker 작업**: 이미지 빌드 및 푸시
4. **파일 업데이트**: 대상 레포지토리 파일 수정
5. **PR 생성**: Pull Request 자동 생성
6. **결과 출력**: 성공/실패 상태 리포트 