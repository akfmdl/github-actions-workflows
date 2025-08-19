# Update Repository Files

다른 레포지토리의 여러 파일에서 Docker 이미지 태그를 업데이트하는 GitHub Action입니다.

## 기능

- 🔄 **다중 파일 업데이트**: 한 번에 여러 파일의 이미지 태그를 업데이트
- 🎯 **YAML 파일 지원**: Kubernetes 매니페스트, Helm values 등 YAML 파일의 이미지 태그 자동 업데이트
- 🌿 **브랜치 지원**: 특정 브랜치나 기본 브랜치에 직접 업데이트
- 📊 **상세한 결과 리포트**: 성공/실패한 파일 목록과 링크 제공
- ⚡ **에러 핸들링**: 개별 파일 실패 시에도 다른 파일들 계속 처리

## 입력값

### 필수 입력값

| 입력값 | 설명 | 예시 |
|--------|------|------|
| `github-token` | GitHub Personal Access Token (repo 권한 필요) | `${{ secrets.GITHUB_TOKEN }}` |
| `docker-registry` | Docker 레지스트리 URL | `registry.example.com` |
| `image-name` | Docker 이미지 이름 | `my-app` |
| `image-tag` | 새로운 이미지 태그 | `v1.2.3` |
| `target-repo` | 업데이트할 대상 레포지토리 | `owner/k8s-manifests` |
| `target-file-paths` | 업데이트할 파일 경로들 (콤마로 구분) | `deployment/app.yaml,k8s/configmap.yaml` |

### 선택적 입력값

| 입력값 | 설명 | 기본값 |
|--------|------|--------|
| `node-version` | Node.js 버전 | `18` |
| `target-branch` | 대상 브랜치 | 기본 브랜치 |
| `commit-message` | 커밋 메시지 | 자동 생성 |

## 출력값

| 출력값 | 설명 |
|--------|------|
| `image-tag` | 업데이트된 이미지 태그 |
| `updated-files` | 성공적으로 업데이트된 파일들 (콤마로 구분) |
| `failed-files` | 업데이트에 실패한 파일들 (콤마로 구분) |
| `success-count` | 성공한 파일 수 |
| `fail-count` | 실패한 파일 수 |

## 사용 예시

### 기본 사용법

```yaml
name: Update K8s Manifests

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'New image tag'
        required: true
        type: string

jobs:
  update-manifests:
    runs-on: ubuntu-latest
    steps:
      - name: Update repository files
        uses: akfmdl/github-actions-workflows/actions/update-repository-files@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          docker-registry: 'registry.example.com'
          image-name: 'my-app'
          image-tag: ${{ inputs.image_tag }}
          target-repo: 'my-org/k8s-manifests'
          target-file-paths: 'deployment/app.yaml,service/configmap.yaml,helm/values.yaml'
```

### 특정 브랜치에 업데이트

```yaml
- name: Update files in development branch
  uses: akfmdl/github-actions-workflows/actions/update-repository-files@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    docker-registry: 'registry.example.com'
    image-name: 'my-app'
    image-tag: 'v1.2.3'
    target-repo: 'my-org/k8s-manifests'
    target-file-paths: 'deployment/app.yaml,k8s/configmap.yaml'
    target-branch: 'development'
    commit-message: 'Update my-app to v1.2.3 in development'
```

### 결과 활용

```yaml
- name: Update repository files
  id: update
  uses: akfmdl/github-actions-workflows/actions/update-repository-files@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    docker-registry: 'registry.example.com'
    image-name: 'my-app'
    image-tag: 'v1.2.3'
    target-repo: 'my-org/k8s-manifests'
    target-file-paths: 'deployment/app.yaml,k8s/configmap.yaml'

- name: Check results
  run: |
    echo "Updated files: ${{ steps.update.outputs.updated-files }}"
    echo "Failed files: ${{ steps.update.outputs.failed-files }}"
    echo "Success count: ${{ steps.update.outputs.success-count }}"
    echo "Fail count: ${{ steps.update.outputs.fail-count }}"
```

## 지원되는 파일 형식

이 액션은 다음과 같은 YAML 패턴에서 이미지 태그를 찾아 업데이트합니다:

### Kubernetes Deployment
```yaml
spec:
  template:
    spec:
      containers:
        - name: my-app
          image: registry.example.com/my-app:v1.0.0  # 이 부분이 업데이트됨
```

### Helm Values
```yaml
image:
  repository: registry.example.com/my-app
  tag: v1.0.0  # 이 부분이 업데이트됨

# 또는
app:
  image: registry.example.com/my-app:v1.0.0  # 이 부분이 업데이트됨
```

### ConfigMap
```yaml
data:
  config.yaml: |
    app:
      image: registry.example.com/my-app:v1.0.0  # 이 부분이 업데이트됨
      value: registry.example.com/my-app:v1.0.0  # 이 부분도 업데이트됨
```

## 요구사항

1. **GitHub Token**: 대상 레포지토리에 대한 쓰기 권한이 있는 GitHub Personal Access Token
2. **파일 형식**: YAML 파일이어야 하며, `image:` 또는 `value:` 키를 사용해야 함
3. **네트워크 접근**: GitHub API에 접근할 수 있어야 함

## 문제 해결

### 일반적인 오류

1. **404 에러**: 
   - 레포지토리 이름이 올바른지 확인
   - 파일 경로가 정확한지 확인
   - GitHub 토큰 권한 확인

2. **이미지 패턴을 찾을 수 없음**:
   - 파일에 올바른 이미지 태그 형식이 있는지 확인
   - 레지스트리와 이미지 이름이 정확한지 확인

3. **브랜치 관련 오류**:
   - 지정된 브랜치가 존재하는지 확인
   - 브랜치에 대한 푸시 권한이 있는지 확인

## 라이센스

MIT License 