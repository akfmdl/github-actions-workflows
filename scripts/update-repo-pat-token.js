#!/usr/bin/env node

const fs = require('fs');

// 환경변수에서 입력값들 가져오기
const TARGET_REPO = process.env.TARGET_REPO;
const FILE_PATH = process.env.FILE_PATH;
const VARIABLE_NAME = process.env.VARIABLE_NAME;
const NEW_VALUE = process.env.NEW_VALUE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE;
const PR_TITLE = process.env.PR_TITLE;
const PR_BODY = process.env.PR_BODY;
const SOURCE_REPOSITORY = process.env.SOURCE_REPOSITORY || 'Unknown';
const SOURCE_WORKFLOW = process.env.SOURCE_WORKFLOW || 'Unknown';
const SOURCE_RUN_ID = process.env.SOURCE_RUN_ID || '';

// GitHub API 호출 헬퍼 함수
async function githubAPI(endpoint, options = {}) {
    const url = `https://api.github.com${endpoint}`;
    const defaultHeaders = {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GitHub-Actions-Update-Repo'
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

async function updateRepositoryFile() {
    console.log('🔧 Update Repository File Script v2.1.0 (Native Fetch API)');
    console.log('='.repeat(60));

    console.log('📋 입력값 확인:');
    console.log(`- Target Repo: ${TARGET_REPO}`);
    console.log(`- File Path: ${FILE_PATH}`);
    console.log(`- Variable Name: ${VARIABLE_NAME}`);
    console.log(`- New Value: ${NEW_VALUE}`);
    console.log(`- Source Repository: ${SOURCE_REPOSITORY}`);
    console.log(`- GitHub Token: ${GITHUB_TOKEN ? `${GITHUB_TOKEN.substring(0, 8)}...` : 'NOT PROVIDED'}`);

    // 필수 입력값 검증
    if (!TARGET_REPO || !FILE_PATH || !VARIABLE_NAME || !NEW_VALUE || !GITHUB_TOKEN) {
        const missingFields = [];
        if (!TARGET_REPO) missingFields.push('TARGET_REPO');
        if (!FILE_PATH) missingFields.push('FILE_PATH');
        if (!VARIABLE_NAME) missingFields.push('VARIABLE_NAME');
        if (!NEW_VALUE) missingFields.push('NEW_VALUE');
        if (!GITHUB_TOKEN) missingFields.push('GITHUB_TOKEN');

        throw new Error(`❌ 필수 입력값이 누락되었습니다: ${missingFields.join(', ')}`);
    }

    const [owner, repo] = TARGET_REPO.split('/');
    if (!owner || !repo) {
        throw new Error('❌ 대상 레포지토리 형식이 올바르지 않습니다. (예: owner/repo-name)');
    }

    try {
        // 1. 원본 파일 내용 가져오기
        console.log('\n📥 파일 내용을 가져오는 중...');
        const fileData = await githubAPI(`/repos/${owner}/${repo}/contents/${FILE_PATH}`);

        const originalContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        console.log('✅ 원본 파일 내용을 성공적으로 가져왔습니다.');

        console.log('📄 원본 파일 내용:');
        console.log('─'.repeat(40));
        console.log(originalContent);
        console.log('─'.repeat(40));

        // 2. 파일 내용 수정
        console.log('\n🔄 파일 내용을 수정하는 중...');
        let updatedContent = originalContent;
        let updateSuccess = false;

        // Makefile 형식 처리
        if (FILE_PATH.includes('Makefile') || FILE_PATH.endsWith('.mk')) {
            const makefilePattern = new RegExp(`^(${escapeRegExp(VARIABLE_NAME)}\\s*\\?*=).*$`, 'gm');
            if (makefilePattern.test(updatedContent)) {
                updatedContent = updatedContent.replace(makefilePattern, `$1${NEW_VALUE}`);
                console.log('✅ Makefile 형식으로 변수를 업데이트했습니다.');
                updateSuccess = true;
            }
        }
        // JSON 형식 처리
        else if (FILE_PATH.endsWith('.json')) {
            try {
                const jsonObj = JSON.parse(updatedContent);
                const keys = VARIABLE_NAME.split('.');
                let current = jsonObj;

                for (let i = 0; i < keys.length - 1; i++) {
                    if (!current[keys[i]]) current[keys[i]] = {};
                    current = current[keys[i]];
                }

                let processedValue = NEW_VALUE;
                if (NEW_VALUE === 'true' || NEW_VALUE === 'false') {
                    processedValue = NEW_VALUE === 'true';
                } else if (!isNaN(NEW_VALUE) && !isNaN(parseFloat(NEW_VALUE))) {
                    processedValue = parseFloat(NEW_VALUE);
                }

                current[keys[keys.length - 1]] = processedValue;
                updatedContent = JSON.stringify(jsonObj, null, 2);
                console.log('✅ JSON 형식으로 변수를 업데이트했습니다.');
                updateSuccess = true;
            } catch (e) {
                throw new Error(`❌ JSON 파일 파싱 오류: ${e.message}`);
            }
        }
        // YAML 형식 처리
        else if (FILE_PATH.endsWith('.yml') || FILE_PATH.endsWith('.yaml')) {
            const yamlPattern = new RegExp(`^(\\s*${escapeRegExp(VARIABLE_NAME)}\\s*:).*$`, 'gm');
            if (yamlPattern.test(updatedContent)) {
                updatedContent = updatedContent.replace(yamlPattern, `$1 ${NEW_VALUE}`);
                console.log('✅ YAML 형식으로 변수를 업데이트했습니다.');
                updateSuccess = true;
            }
        }
        // 환경변수 파일 처리
        else if (FILE_PATH.endsWith('.env')) {
            const envPattern = new RegExp(`^${escapeRegExp(VARIABLE_NAME)}=.*$`, 'gm');
            if (envPattern.test(updatedContent)) {
                updatedContent = updatedContent.replace(envPattern, `${VARIABLE_NAME}=${NEW_VALUE}`);
                console.log('✅ 환경변수 파일 형식으로 변수를 업데이트했습니다.');
                updateSuccess = true;
            }
        }
        // Python 파일 처리
        else if (FILE_PATH.endsWith('.py')) {
            const pythonPatterns = [
                new RegExp(`^(${escapeRegExp(VARIABLE_NAME)}\\s*=\\s*)(['"])[^'"]*\\2`, 'gm'),
                new RegExp(`^(${escapeRegExp(VARIABLE_NAME)}\\s*=\\s*)([^'"][^\\n\\r]*)$`, 'gm')
            ];

            for (const pattern of pythonPatterns) {
                if (pattern.test(originalContent)) {
                    updatedContent = updatedContent.replace(pattern, `$1"${NEW_VALUE}"`);
                    console.log('✅ Python 파일 형식으로 변수를 업데이트했습니다.');
                    updateSuccess = true;
                    break;
                }
            }
        }

        // 일반 텍스트 파일 처리
        if (!updateSuccess) {
            const genericPatterns = [
                new RegExp(`^(${escapeRegExp(VARIABLE_NAME)}\\s*[:=]\\s*)([^\\n\\r]+)`, 'gm'),
                new RegExp(`(${escapeRegExp(VARIABLE_NAME)}\\s*[:=]\\s*)([^\\n\\r]+)`, 'g')
            ];

            for (const pattern of genericPatterns) {
                if (pattern.test(originalContent)) {
                    updatedContent = updatedContent.replace(pattern, `$1${NEW_VALUE}`);
                    console.log('✅ 일반 텍스트 형식으로 변수를 업데이트했습니다.');
                    updateSuccess = true;
                    break;
                }
            }
        }

        if (!updateSuccess || updatedContent === originalContent) {
            throw new Error(`❌ 파일에서 변수 '${VARIABLE_NAME}'를 찾아서 수정할 수 없습니다.`);
        }

        console.log('📄 수정된 파일 내용:');
        console.log('─'.repeat(40));
        console.log(updatedContent);
        console.log('─'.repeat(40));

        // 3. 새 브랜치 생성
        const timestamp = Date.now();
        const branchName = `update-${VARIABLE_NAME.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`;
        console.log(`\n🌿 새 브랜치 생성: ${branchName}`);

        // 기본 브랜치 정보 가져오기
        console.log('📋 기본 브랜치 정보 확인 중...');
        const repoData = await githubAPI(`/repos/${owner}/${repo}`);
        console.log(`📌 기본 브랜치: ${repoData.default_branch}`);

        const defaultBranchData = await githubAPI(`/repos/${owner}/${repo}/branches/${repoData.default_branch}`);
        console.log(`📋 기본 브랜치 SHA: ${defaultBranchData.commit.sha}`);

        // 새 브랜치 생성
        console.log(`🚀 브랜치 생성 시도: refs/heads/${branchName}`);
        await githubAPI(`/repos/${owner}/${repo}/git/refs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ref: `refs/heads/${branchName}`,
                sha: defaultBranchData.commit.sha
            })
        });
        console.log('✅ 새 브랜치가 성공적으로 생성되었습니다.');

        // 4. 파일 업데이트
        console.log('\n📝 파일을 업데이트하는 중...');
        const commitMessage = COMMIT_MESSAGE || `Update ${VARIABLE_NAME} to ${NEW_VALUE}`;

        await githubAPI(`/repos/${owner}/${repo}/contents/${FILE_PATH}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: commitMessage,
                content: Buffer.from(updatedContent).toString('base64'),
                sha: fileData.sha,
                branch: branchName
            })
        });

        console.log('✅ 파일이 성공적으로 업데이트되었습니다.');

        // 5. Pull Request 생성
        console.log('\n🚀 Pull Request를 생성하는 중...');
        const prTitle = PR_TITLE || `Update ${VARIABLE_NAME} in ${FILE_PATH}`;

        let prBody = PR_BODY;
        if (!prBody || prBody.trim() === '') {
            prBody = `이 PR은 자동으로 생성되었습니다.

## 📋 변경사항
- **파일**: \`${FILE_PATH}\`
- **변수**: \`${VARIABLE_NAME}\`
- **새 값**: \`${NEW_VALUE}\`

## 🔗 소스 정보
- **소스 레포지토리**: [${SOURCE_REPOSITORY}](https://github.com/${SOURCE_REPOSITORY})
- **워크플로우**: ${SOURCE_WORKFLOW}`;

            if (SOURCE_RUN_ID) {
                prBody += `\n- **실행 ID**: [${SOURCE_RUN_ID}](https://github.com/${SOURCE_REPOSITORY}/actions/runs/${SOURCE_RUN_ID})`;
            }
        }

        const pullRequest = await githubAPI(`/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: prTitle,
                head: branchName,
                base: repoData.default_branch,
                body: prBody
            })
        });

        console.log(`✅ Pull Request가 성공적으로 생성되었습니다!`);
        console.log(`🔗 PR URL: ${pullRequest.html_url}`);
        console.log(`🔢 PR Number: ${pullRequest.number}`);

        // GitHub Actions 출력 설정
        if (process.env.GITHUB_OUTPUT) {
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr-url=${pullRequest.html_url}\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr-number=${pullRequest.number}\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `branch-name=${branchName}\n`);
        }

        console.log(`::set-output name=pr-url::${pullRequest.html_url}`);
        console.log(`::set-output name=pr-number::${pullRequest.number}`);
        console.log(`::set-output name=branch-name::${branchName}`);

        console.log('\n🎉 모든 작업이 성공적으로 완료되었습니다!');

    } catch (error) {
        console.error('\n❌ 오류가 발생했습니다:');
        console.error(error.message);

        process.exit(1);
    }
}

// 정규식 특수문자 이스케이프 함수
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 스크립트 실행
updateRepositoryFile().catch(error => {
    console.error('❌ Update Repository Script 실행 중 오류:', error.message);
    process.exit(1);
}); 