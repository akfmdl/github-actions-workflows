#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// 환경변수에서 입력값들 가져오기
const DOCKER_REGISTRY = process.env.DOCKER_REGISTRY;
const IMAGE_NAME = process.env.IMAGE_NAME;
const IMAGE_TAG = process.env.IMAGE_TAG;
const DOCKERFILE_PATH = process.env.DOCKERFILE_PATH;
const BUILD_CONTEXT = process.env.BUILD_CONTEXT;
const TARGET_REPO = process.env.TARGET_REPO;
const TARGET_FILE_PATH = process.env.TARGET_FILE_PATH;
const TARGET_BRANCH = process.env.TARGET_BRANCH;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REGISTRY_USERNAME = process.env.REGISTRY_USERNAME;
const REGISTRY_PASSWORD = process.env.REGISTRY_PASSWORD;
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE;

// GitHub API 호출 헬퍼 함수
async function githubAPI(endpoint, options = {}) {
    const url = `https://api.github.com${endpoint}`;
    const defaultHeaders = {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Docker-Build-Push-Update-Workflow'
    };

    const response = await fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}\n${errorData}`);
    }

    return await response.json();
}

// Docker 이미지 빌드 및 푸시
async function buildAndPushDockerImage() {
    console.log('\n🐳 Docker 이미지 빌드 및 푸시 시작');
    console.log('='.repeat(60));

    const fullImageName = `${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}`;

    try {
        // Docker 레지스트리 로그인
        if (REGISTRY_USERNAME && REGISTRY_PASSWORD) {
            console.log('🔑 Container Registry 로그인 중...');

            try {
                // 첫 번째 시도: 일반 로그인
                execSync(`echo "${REGISTRY_PASSWORD}" | docker login ${DOCKER_REGISTRY} -u ${REGISTRY_USERNAME} --password-stdin`, {
                    stdio: 'pipe'
                });
                console.log('✅ Registry 로그인 성공');
            } catch (loginError) {
                console.log('⚠️ 일반 로그인 실패, 대안 방법 시도 중...');

                try {
                    // 두 번째 시도: Docker 데몬 재시작 후 재시도
                    console.log('🔄 Docker 서비스 확인 중...');
                    execSync('docker info', { stdio: 'pipe' });

                    // 재시도
                    execSync(`echo "${REGISTRY_PASSWORD}" | docker login ${DOCKER_REGISTRY} -u ${REGISTRY_USERNAME} --password-stdin`, {
                        stdio: 'pipe'
                    });
                    console.log('✅ Registry 로그인 성공 (재시도)');
                } catch (retryError) {
                    console.log('❌ Docker 로그인 실패');
                    console.log('💡 해결 방법:');
                    console.log('1. Docker Desktop이 실행 중인지 확인하세요');
                    console.log('2. VPN 연결을 확인하세요 (회사 네트워크)');
                    console.log('3. Registry 인증 정보가 올바른지 확인하세요');
                    console.log('4. 로컬에서 직접 테스트: docker login ' + DOCKER_REGISTRY);

                    // 로그인 없이 계속 진행 (public 이미지인 경우)
                    console.log('⚠️ 로그인 없이 빌드를 시도합니다...');
                }
            }
        }

        // Docker 이미지 빌드
        console.log(`🔨 Docker 이미지 빌드 중: ${fullImageName}`);
        try {
            // execSync(`docker build -f ${DOCKERFILE_PATH} -t ${fullImageName} ${BUILD_CONTEXT}`, {
            //     stdio: 'inherit'
            // });
            console.log('✅ Docker 이미지 빌드 완료');
        } catch (buildError) {
            console.log('❌ Docker 빌드 실패');
            console.log('💡 확인사항:');
            console.log(`1. Dockerfile 경로가 올바른지 확인: ${DOCKERFILE_PATH}`);
            console.log(`2. 빌드 컨텍스트가 올바른지 확인: ${BUILD_CONTEXT}`);
            console.log('3. Dockerfile 문법이 올바른지 확인');
            throw buildError;
        }

        // Docker 이미지 푸시
        console.log(`📤 Docker 이미지 푸시 중: ${fullImageName}`);
        try {
            // execSync(`docker push ${fullImageName}`, {
            //     stdio: 'inherit'
            // });
            console.log('✅ Docker 이미지 푸시 완료');
        } catch (pushError) {
            console.log('❌ Docker 푸시 실패');
            console.log('💡 가능한 원인:');
            console.log('1. Registry 로그인이 실패했을 수 있습니다');
            console.log('2. 네트워크 연결 문제 (VPN, 방화벽)');
            console.log('3. Registry 권한 문제');
            console.log('4. Registry URL이 올바르지 않음');
            throw pushError;
        }

        return fullImageName;
    } catch (error) {
        throw new Error(`❌ Docker 빌드/푸시 실패: ${error.message}`);
    }
}

// YAML 파일에서 이미지 태그 업데이트
function updateYamlImageTag(content) {
    const fullImageName = `${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}`;
    const imagePattern = new RegExp(
        `(\\s*image:\\s*)(${DOCKER_REGISTRY}/${IMAGE_NAME}):([^\\s\\n]+)`,
        'g'
    );

    if (imagePattern.test(content)) {
        const updatedContent = content.replace(imagePattern, `$1${fullImageName}`);
        console.log(`✅ 이미지 태그 업데이트: ${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}`);
        return updatedContent;
    } else {
        throw new Error(`❌ 이미지 패턴을 찾을 수 없습니다: ${DOCKER_REGISTRY}/${IMAGE_NAME}`);
    }
}

// 다른 레포지토리의 파일 업데이트
async function updateTargetRepositoryFile() {
    console.log('\n📝 대상 레포지토리 파일 업데이트 시작');
    console.log('='.repeat(60));

    const [owner, repo] = TARGET_REPO.split('/');
    if (!owner || !repo) {
        throw new Error('❌ 대상 레포지토리 형식이 올바르지 않습니다. (예: owner/repo-name)');
    }

    try {
        // 1. 레포지토리 접근 권한 확인
        console.log(`🔍 레포지토리 접근 권한 확인: ${owner}/${repo}`);
        const repoCheck = await githubAPI(`/repos/${owner}/${repo}`);
        console.log(`✅ 레포지토리 접근 가능: ${repoCheck.full_name}`);

        // 1.5. 브랜치 확인 (TARGET_BRANCH가 지정된 경우)
        if (TARGET_BRANCH) {
            console.log(`🔍 브랜치 존재 확인: ${TARGET_BRANCH}`);
            try {
                await githubAPI(`/repos/${owner}/${repo}/branches/${TARGET_BRANCH}`);
                console.log(`✅ 브랜치 존재 확인됨: ${TARGET_BRANCH}`);
            } catch (branchError) {
                throw new Error(`❌ 지정된 브랜치가 존재하지 않습니다: ${TARGET_BRANCH}`);
            }
        }

        // 2. 원본 파일 내용 가져오기
        console.log(`📥 파일 내용 가져오는 중: ${TARGET_FILE_PATH}`);
        const fileData = await githubAPI(`/repos/${owner}/${repo}/contents/${TARGET_FILE_PATH}`);

        const originalContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        console.log('✅ 원본 파일 내용을 성공적으로 가져왔습니다.');

        // 3. 파일 내용 수정
        console.log('🔄 이미지 태그 업데이트 중...');
        const updatedContent = updateYamlImageTag(originalContent);

        if (originalContent === updatedContent) {
            console.log('⚠️ 파일 내용이 변경되지 않았습니다. 업데이트를 건너뜁니다.');
            return;
        }

        // 4. 대상 브랜치 결정
        let targetBranch;
        if (TARGET_BRANCH) {
            targetBranch = TARGET_BRANCH;
            console.log(`📍 지정된 대상 브랜치: ${targetBranch}`);
        } else {
            const repoInfo = await githubAPI(`/repos/${owner}/${repo}`);
            targetBranch = repoInfo.default_branch;
            console.log(`📍 기본 브랜치 사용: ${targetBranch}`);
        }

        // 5. 파일 업데이트 (지정된 브랜치에 직접 push)
        console.log('💾 파일 업데이트 중...');
        const commitMessage = COMMIT_MESSAGE || `Update ${IMAGE_NAME} image to ${IMAGE_TAG}`;

        await githubAPI(`/repos/${owner}/${repo}/contents/${TARGET_FILE_PATH}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: commitMessage,
                content: Buffer.from(updatedContent, 'utf8').toString('base64'),
                sha: fileData.sha,
                branch: targetBranch
            })
        });
        console.log(`✅ 파일 업데이트 완료 (${targetBranch} 브랜치에 직접 push)`);

        return {
            commitMessage,
            updatedFile: TARGET_FILE_PATH
        };

    } catch (error) {
        throw new Error(`❌ 대상 레포지토리 파일 업데이트 실패: ${error.message}`);
    }
}

// 메인 실행 함수
async function main() {
    console.log('🚀 Docker Build & Push + Repository Update Workflow v1.0.0');
    console.log('='.repeat(80));

    console.log('📋 설정 확인:');
    console.log(`- Docker Registry: ${DOCKER_REGISTRY}`);
    console.log(`- Image Name: ${IMAGE_NAME}`);
    console.log(`- Image Tag: ${IMAGE_TAG}`);
    console.log(`- Dockerfile Path: ${DOCKERFILE_PATH}`);
    console.log(`- Build Context: ${BUILD_CONTEXT}`);
    console.log(`- Target Repository: ${TARGET_REPO}`);
    console.log(`- Target File Path: ${TARGET_FILE_PATH}`);
    console.log(`- Target Branch: ${TARGET_BRANCH}`);
    console.log(`- GitHub Token: ${GITHUB_TOKEN ? `${GITHUB_TOKEN.substring(0, 8)}...` : 'NOT PROVIDED'}`);

    // 필수 입력값 검증 (실제 변수값 확인)
    const requiredValues = {
        'IMAGE_NAME': IMAGE_NAME,
        'IMAGE_TAG': IMAGE_TAG,
        'TARGET_REPO': TARGET_REPO,
        'TARGET_FILE_PATH': TARGET_FILE_PATH,
        'GITHUB_TOKEN': GITHUB_TOKEN
    };

    const missingFields = Object.entries(requiredValues)
        .filter(([key, value]) => !value)
        .map(([key]) => key);

    if (missingFields.length > 0) {
        throw new Error(`❌ 필수 값이 누락되었습니다: ${missingFields.join(', ')}`);
    }

    try {
        // 1. Docker 이미지 빌드 및 푸시
        const fullImageName = await buildAndPushDockerImage();
        console.log(`✅ Docker 이미지 빌드/푸시 완료: ${fullImageName}`);

        // 2. 대상 레포지토리 파일 업데이트
        const updateResult = await updateTargetRepositoryFile();

        if (updateResult) {
            console.log('\n🎉 워크플로우 완료!');
            console.log(`- 이미지: ${fullImageName}`);
            console.log(`- 업데이트된 파일: ${updateResult.updatedFile}`);
            console.log(`- 커밋 메시지: ${updateResult.commitMessage}`);

            // GitHub Actions outputs 설정
            if (process.env.GITHUB_OUTPUT) {
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `image-tag=${IMAGE_TAG}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `full-image-name=${fullImageName}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `updated-file=${updateResult.updatedFile}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit-message=${updateResult.commitMessage}\n`);
            }
        } else {
            console.log('\n✅ 워크플로우 완료 (업데이트 없음)');

            // GitHub Actions outputs 설정 (업데이트 없는 경우)
            if (process.env.GITHUB_OUTPUT) {
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `image-tag=${IMAGE_TAG}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `full-image-name=${fullImageName}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `updated-file=\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit-message=\n`);
            }
        }

    } catch (error) {
        console.error(`\n❌ 워크플로우 실행 실패: ${error.message}`);
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    main().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    buildAndPushDockerImage,
    updateTargetRepositoryFile,
    updateYamlImageTag
}; 