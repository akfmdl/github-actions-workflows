#!/usr/bin/env node

const fs = require('fs');

// 환경변수에서 입력값들 가져오기
const DOCKER_REGISTRY = process.env.DOCKER_REGISTRY;
const IMAGE_NAME = process.env.IMAGE_NAME;
const IMAGE_TAG = process.env.IMAGE_TAG;
const TARGET_REPO = process.env.TARGET_REPO;
const TARGET_FILE_PATHS = process.env.TARGET_FILE_PATHS; // 콤마로 구분된 파일 경로들
const TARGET_BRANCH = process.env.TARGET_BRANCH;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE;

// GitHub API 호출 헬퍼 함수
async function githubAPI(endpoint, options = {}) {
    const url = `https://api.github.com${endpoint}`;
    const defaultHeaders = {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Repository-Files-Update-Workflow'
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
        console.log(`❌ GitHub API 요청 실패:`);
        console.log(`   URL: ${url}`);
        console.log(`   Status: ${response.status} ${response.statusText}`);
        console.log(`   Error: ${errorData}`);

        if (response.status === 404) {
            throw new Error(`❌ 파일 또는 리소스를 찾을 수 없습니다:\n` +
                `   URL: ${url}\n` +
                `   확인사항:\n` +
                `   1. 레포지토리가 존재하는지\n` +
                `   2. 파일 경로가 정확한지\n` +
                `   3. 지정된 브랜치가 존재하는지\n` +
                `   4. GitHub 토큰에 접근 권한이 있는지`);
        }

        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}\n${errorData}`);
    }

    return await response.json();
}

// YAML 파일에서 이미지 태그 업데이트
function updateYamlImageTag(content) {
    const fullImageName = `${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}`;
    // image: 와 value: 모두 매칭하는 정규표현식
    const imagePattern = new RegExp(
        `(\\s*(?:image|value):\\s*)(${DOCKER_REGISTRY}/${IMAGE_NAME}):([^\\s\\n]+)`,
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

// 단일 파일 업데이트
async function updateSingleFile(owner, repo, filePath, repoCheck) {
    console.log(`\n📝 파일 업데이트 시작: ${filePath}`);
    console.log('-'.repeat(50));

    try {
        // 1. 파일 내용 가져오기
        console.log(`📥 파일 내용 가져오는 중: ${filePath}`);
        console.log(`📍 Repository: ${owner}/${repo}`);
        console.log(`📍 Branch: ${TARGET_BRANCH || repoCheck.default_branch}`);

        // 브랜치 파라미터 추가 - TARGET_BRANCH가 지정되어 있으면 해당 브랜치에서 파일 가져오기
        const contentParams = TARGET_BRANCH ? `?ref=${TARGET_BRANCH}` : '';
        const fileData = await githubAPI(`/repos/${owner}/${repo}/contents/${filePath}${contentParams}`);

        const originalContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        console.log('✅ 원본 파일 내용을 성공적으로 가져왔습니다.');

        // 2. 파일 내용 수정
        console.log('🔄 이미지 태그 업데이트 중...');
        const updatedContent = updateYamlImageTag(originalContent);

        if (originalContent === updatedContent) {
            console.log('⚠️ 파일 내용이 변경되지 않았습니다. 업데이트를 건너뜁니다.');
            return null;
        }

        // 3. 대상 브랜치 결정 (파일을 가져온 브랜치와 동일)
        const targetBranch = TARGET_BRANCH || repoCheck.default_branch;
        console.log(`📍 업데이트 대상 브랜치: ${targetBranch}`);

        // 4. 파일 업데이트 (지정된 브랜치에 직접 push)
        console.log('💾 파일 업데이트 중...');
        const commitMessage = COMMIT_MESSAGE || `Update ${IMAGE_NAME} image to ${IMAGE_TAG} in ${filePath}`;

        const commitResult = await githubAPI(`/repos/${owner}/${repo}/contents/${filePath}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: commitMessage,
                content: Buffer.from(updatedContent, 'utf8').toString('base64'),
                sha: fileData.sha,
                branch: targetBranch
            })
        });
        console.log(`✅ 파일 업데이트 완료: ${filePath} (${targetBranch} 브랜치에 직접 push)`);

        return {
            filePath,
            commitMessage,
            commitSha: commitResult.commit.sha,
            commitUrl: commitResult.commit.html_url
        };

    } catch (error) {
        console.error(`❌ 파일 업데이트 실패 (${filePath}): ${error.message}`);
        // 개별 파일 실패 시 에러를 던지지 않고 null 반환하여 다른 파일들도 처리할 수 있도록 함
        return {
            filePath,
            error: error.message
        };
    }
}

// 다른 레포지토리의 파일들 업데이트
async function updateTargetRepositoryFiles() {
    console.log('\n📝 대상 레포지토리 파일들 업데이트 시작');
    console.log('='.repeat(60));

    // 파일 경로들 파싱
    const filePaths = TARGET_FILE_PATHS.split(',').map(path => path.trim()).filter(path => path);
    if (filePaths.length === 0) {
        throw new Error('❌ 업데이트할 파일 경로가 지정되지 않았습니다.');
    }

    console.log(`📋 업데이트 대상 파일들 (${filePaths.length}개):`);
    filePaths.forEach((path, index) => {
        console.log(`   ${index + 1}. ${path}`);
    });

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

        // 2. 각 파일 순차적으로 업데이트
        const results = [];
        for (const filePath of filePaths) {
            const result = await updateSingleFile(owner, repo, filePath, repoCheck);
            if (result) {
                results.push(result);
            }
        }

        return results;

    } catch (error) {
        throw new Error(`❌ 대상 레포지토리 파일들 업데이트 실패: ${error.message}`);
    }
}

// 메인 실행 함수
async function main() {
    console.log('🚀 Repository Files Update Workflow');
    console.log('='.repeat(80));

    console.log('📋 설정 확인:');
    console.log(`- Docker Registry: ${DOCKER_REGISTRY}`);
    console.log(`- Image Name: ${IMAGE_NAME}`);
    console.log(`- Image Tag: ${IMAGE_TAG}`);
    console.log(`- Target Repository: ${TARGET_REPO}`);
    console.log(`- Target File Paths: ${TARGET_FILE_PATHS}`);
    console.log(`- Target Branch: ${TARGET_BRANCH || 'default branch'}`);
    console.log(`- GitHub Token: ${GITHUB_TOKEN ? `${GITHUB_TOKEN.substring(0, 8)}...` : 'NOT PROVIDED'}`);

    // 필수 입력값 검증
    const requiredValues = {
        'DOCKER_REGISTRY': DOCKER_REGISTRY,
        'IMAGE_NAME': IMAGE_NAME,
        'IMAGE_TAG': IMAGE_TAG,
        'TARGET_REPO': TARGET_REPO,
        'TARGET_FILE_PATHS': TARGET_FILE_PATHS,
        'GITHUB_TOKEN': GITHUB_TOKEN
    };

    const missingFields = Object.entries(requiredValues)
        .filter(([key, value]) => !value)
        .map(([key]) => key);

    if (missingFields.length > 0) {
        throw new Error(`❌ 필수 값이 누락되었습니다: ${missingFields.join(', ')}`);
    }

    try {
        // 대상 레포지토리 파일들 업데이트
        const updateResults = await updateTargetRepositoryFiles();

        // 결과 분석
        const successfulUpdates = updateResults.filter(result => !result.error);
        const failedUpdates = updateResults.filter(result => result.error);

        if (successfulUpdates.length > 0) {
            console.log('\n🎉 파일 업데이트 완료!');
            console.log(`✅ 성공: ${successfulUpdates.length}개 파일`);
            successfulUpdates.forEach((result, index) => {
                console.log(`   ${index + 1}. ${result.filePath}`);
                console.log(`      - 커밋 메시지: ${result.commitMessage}`);
                console.log(`      - 커밋 URL: ${result.commitUrl}`);
            });

            if (failedUpdates.length > 0) {
                console.log(`\n⚠️ 실패: ${failedUpdates.length}개 파일`);
                failedUpdates.forEach((result, index) => {
                    console.log(`   ${index + 1}. ${result.filePath}: ${result.error}`);
                });
            }

            // GitHub Actions outputs 설정
            if (process.env.GITHUB_OUTPUT) {
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `image-tag=${IMAGE_TAG}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `updated-files=${successfulUpdates.map(r => r.filePath).join(',')}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `failed-files=${failedUpdates.map(r => r.filePath).join(',')}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `success-count=${successfulUpdates.length}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `fail-count=${failedUpdates.length}\n`);
            }

            // GitHub Step Summary 생성
            if (process.env.GITHUB_STEP_SUMMARY) {
                const [owner, repo] = TARGET_REPO.split('/');
                const targetBranch = TARGET_BRANCH || 'main';
                const repoUrl = `https://github.com/${owner}/${repo}`;
                const branchUrl = `https://github.com/${owner}/${repo}/tree/${targetBranch}`;

                let summary = `
## 🎉 Repository Files Update 완료!

### 📋 업데이트 정보
- **Registry**: \`${DOCKER_REGISTRY}\`
- **Image**: \`${IMAGE_NAME}\`
- **Tag**: \`${IMAGE_TAG}\`

### 📁 업데이트 대상
- **Repository**: [${TARGET_REPO}](${repoUrl})
- **Branch**: [${targetBranch}](${branchUrl})

### ✅ 업데이트 결과
- **총 파일 수**: ${updateResults.length}개
- **성공**: ${successfulUpdates.length}개
- **실패**: ${failedUpdates.length}개

`;

                if (successfulUpdates.length > 0) {
                    summary += `### 🎯 성공한 파일들\n`;
                    successfulUpdates.forEach((result, index) => {
                        const fileUrl = `https://github.com/${owner}/${repo}/blob/${targetBranch}/${result.filePath}`;
                        summary += `${index + 1}. [${result.filePath}](${fileUrl})\n`;
                        summary += `   - 커밋: [${result.commitSha.substring(0, 7)}](${result.commitUrl})\n`;
                    });
                    summary += `\n`;
                }

                if (failedUpdates.length > 0) {
                    summary += `### ❌ 실패한 파일들\n`;
                    failedUpdates.forEach((result, index) => {
                        summary += `${index + 1}. \`${result.filePath}\`: ${result.error}\n`;
                    });
                    summary += `\n`;
                }

                summary += `### 🔗 빠른 링크
- [📈 레포지토리 보기](${repoUrl})
- [🌿 브랜치 보기](${branchUrl})
`;

                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
            }
        } else {
            console.log('\n⚠️ 모든 파일 업데이트 실패 또는 변경사항 없음');

            if (failedUpdates.length > 0) {
                console.log('실패한 파일들:');
                failedUpdates.forEach((result, index) => {
                    console.log(`   ${index + 1}. ${result.filePath}: ${result.error}`);
                });
            } else {
                console.log('모든 파일이 이미 최신 상태입니다.');
            }

            // GitHub Actions outputs 설정 (업데이트 없는 경우)
            if (process.env.GITHUB_OUTPUT) {
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `image-tag=${IMAGE_TAG}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `updated-files=\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `failed-files=${failedUpdates.map(r => r.filePath).join(',')}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `success-count=0\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `fail-count=${failedUpdates.length}\n`);
            }

            // GitHub Step Summary 생성 (업데이트 없는 경우)
            if (process.env.GITHUB_STEP_SUMMARY) {
                const [owner, repo] = TARGET_REPO.split('/');
                const targetBranch = TARGET_BRANCH || 'main';
                const repoUrl = `https://github.com/${owner}/${repo}`;

                const summary = `
## ⚠️ Repository Files Check 완료

### 📋 확인 정보
- **Registry**: \`${DOCKER_REGISTRY}\`
- **Image**: \`${IMAGE_NAME}\`
- **Tag**: \`${IMAGE_TAG}\`

### 📁 확인 대상
- **Repository**: [${TARGET_REPO}](${repoUrl})
- **Branch**: \`${targetBranch}\`
- **파일 수**: ${TARGET_FILE_PATHS.split(',').length}개

### ℹ️ 상태
${failedUpdates.length > 0 ? '일부 파일 처리 중 오류가 발생했습니다.' : '모든 파일이 이미 최신 상태입니다.'}

### 🔗 빠른 링크
- [📈 레포지토리 보기](${repoUrl})
`;

                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
            }
        }

    } catch (error) {
        console.error(`\n❌ 파일들 업데이트 실행 실패: ${error.message}`);
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
    updateTargetRepositoryFiles,
    updateSingleFile,
    updateYamlImageTag
}; 