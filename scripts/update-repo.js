#!/usr/bin/env node

// ES Module 호환성을 위한 dynamic import
async function loadDependencies() {
    const { Octokit } = await import('@octokit/rest');
    const fs = await import('fs');
    return { Octokit, fs: fs.default };
}

// 환경변수에서 입력값들 가져오기
const TARGET_REPO = process.env.TARGET_REPO;
const FILE_PATH = process.env.FILE_PATH;
const VARIABLE_NAME = process.env.VARIABLE_NAME;
const NEW_VALUE = process.env.NEW_VALUE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE || '';
const PR_TITLE = process.env.PR_TITLE || '';
const PR_BODY = process.env.PR_BODY || '';
const SOURCE_REPOSITORY = process.env.SOURCE_REPOSITORY || 'Unknown';
const SOURCE_WORKFLOW = process.env.SOURCE_WORKFLOW || 'Unknown';
const SOURCE_RUN_ID = process.env.SOURCE_RUN_ID || '';

async function updateRepositoryFile() {
    console.log('🔧 Update Repository File Script v1.0.0');
    console.log('='.repeat(50));

    // 의존성 로드
    console.log('📦 Loading dependencies...');
    const { Octokit, fs } = await loadDependencies();
    console.log('✅ Dependencies loaded successfully');

    console.log('📋 입력값 확인:');
    console.log(`- Target Repo: ${TARGET_REPO}`);
    console.log(`- File Path: ${FILE_PATH}`);
    console.log(`- Variable Name: ${VARIABLE_NAME}`);
    console.log(`- New Value: ${NEW_VALUE}`);
    console.log(`- Source Repository: ${SOURCE_REPOSITORY}`);

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

    const octokit = new Octokit({
        auth: GITHUB_TOKEN,
    });

    try {

        // 1. 원본 파일 내용 가져오기
        console.log('\n📥 파일 내용을 가져오는 중...');
        const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: FILE_PATH,
        });

        const originalContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        console.log('✅ 원본 파일 내용을 성공적으로 가져왔습니다.');

        // 2. 파일 내용 수정
        console.log('\n🔄 파일 내용을 수정하는 중...');
        let updatedContent = originalContent;
        let updateSuccess = false;

        // Makefile 형식 처리 (변수?=값 또는 변수=값)
        const makefilePattern = new RegExp(`^(${escapeRegExp(VARIABLE_NAME)}\\s*\\?*=).*$`, 'gm');
        if (makefilePattern.test(updatedContent)) {
            updatedContent = updatedContent.replace(makefilePattern, `$1${NEW_VALUE}`);
            console.log('✅ Makefile 형식으로 변수를 업데이트했습니다.');
            updateSuccess = true;
        }
        // JSON 형식 처리
        else if (FILE_PATH.endsWith('.json')) {
            try {
                const jsonObj = JSON.parse(updatedContent);
                const keys = VARIABLE_NAME.split('.');
                let current = jsonObj;

                // 중첩된 객체 경로 탐색
                for (let i = 0; i < keys.length - 1; i++) {
                    if (!current[keys[i]]) current[keys[i]] = {};
                    current = current[keys[i]];
                }

                // 값 타입 처리 (숫자, 불린, 문자열)
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
        // 환경변수 파일 처리 (.env)
        else if (FILE_PATH.endsWith('.env')) {
            const envPattern = new RegExp(`^${escapeRegExp(VARIABLE_NAME)}=.*$`, 'gm');
            if (envPattern.test(updatedContent)) {
                updatedContent = updatedContent.replace(envPattern, `${VARIABLE_NAME}=${NEW_VALUE}`);
                console.log('✅ 환경변수 파일 형식으로 변수를 업데이트했습니다.');
                updateSuccess = true;
            }
        }
        // Python 파일 처리 (version.py 등)
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

        // 일반 텍스트 파일 처리 (마지막 시도)
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

        // 3. 새 브랜치 생성
        const timestamp = Date.now();
        const branchName = `update-${VARIABLE_NAME.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`;
        console.log(`\n🌿 새 브랜치 생성: ${branchName}`);

        // 기본 브랜치 정보 가져오기 (이미 위에서 가져왔지만 재사용)
        console.log('📋 기본 브랜치 정보 확인 중...');
        const { data: repoData } = await octokit.rest.repos.get({
            owner,
            repo,
        });
        console.log(`📌 기본 브랜치: ${repoData.default_branch}`);

        const { data: defaultBranchData } = await octokit.rest.repos.getBranch({
            owner,
            repo,
            branch: repoData.default_branch,
        });
        console.log(`📋 기본 브랜치 SHA: ${defaultBranchData.commit.sha}`);

        // Git refs 생성 권한 확인
        console.log('🔐 브랜치 생성 권한 확인 중...');
        try {
            // 새 브랜치 생성
            console.log(`🚀 브랜치 생성 시도: refs/heads/${branchName}`);
            await octokit.rest.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branchName}`,
                sha: defaultBranchData.commit.sha,
            });
        } catch (branchError) {
            console.error(`❌ 브랜치 생성 실패:`, branchError.message);
            console.error(`📊 에러 상태: ${branchError.status}`);
            console.error(`📊 에러 응답:`, JSON.stringify(branchError.response?.data || {}, null, 2));

            if (branchError.status === 403) {
                throw new Error(`브랜치 생성 권한이 없습니다. Personal Access Token에 다음 권한이 있는지 확인하세요:
1. 'repo' 권한 (Full control of private repositories)
2. 대상 레포지토리가 개인 소유가 아닌 경우 Organization 설정에서 Personal Access Token 사용이 허용되어 있는지 확인
3. 토큰이 해당 레포지토리에 대한 push 권한이 있는지 확인`);
            }
            throw branchError;
        }

        console.log('✅ 새 브랜치가 성공적으로 생성되었습니다.');

        // 4. 파일 업데이트
        console.log('\n📝 파일을 업데이트하는 중...');
        const commitMessage = COMMIT_MESSAGE || `Update ${VARIABLE_NAME} to ${NEW_VALUE}`;

        await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: FILE_PATH,
            message: commitMessage,
            content: Buffer.from(updatedContent).toString('base64'),
            sha: fileData.sha,
            branch: branchName,
        });

        console.log('✅ 파일이 성공적으로 업데이트되었습니다.');

        // 5. Pull Request 생성
        console.log('\n🚀 Pull Request를 생성하는 중...');
        const prTitle = PR_TITLE || `Update ${VARIABLE_NAME} in ${FILE_PATH}`;

        let prBody = PR_BODY;
        if (!prBody) {
            prBody = `이 PR은 자동으로 생성되었습니다.

            ## 📋 변경사항
            - **파일**: \`${FILE_PATH}\`
            - **변수**: \`${VARIABLE_NAME}\`
            - **새 값**: \`${NEW_VALUE}\`

            ## 🔗 소스 정보
            - **소스 레포지토리**: ${SOURCE_REPOSITORY}
            - **워크플로우**: ${SOURCE_WORKFLOW}`;

            if (SOURCE_RUN_ID) {
                prBody += `\n- **실행 ID**: [${SOURCE_RUN_ID}](https://github.com/${SOURCE_REPOSITORY}/actions/runs/${SOURCE_RUN_ID})`;
            }
        }

        const { data: pullRequest } = await octokit.rest.pulls.create({
            owner,
            repo,
            title: prTitle,
            head: branchName,
            base: repoData.default_branch,
            body: prBody,
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
        console.error('\n❌ 오류 발생:', error.message);

        // 디버그 정보 출력
        if (error.response) {
            console.error('📊 API 응답 상태:', error.response.status);
            console.error('📊 API 응답 데이터:', JSON.stringify(error.response.data, null, 2));
        }

        process.exit(1);
    }
}

// 정규식 특수문자 이스케이프 함수
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 스크립트가 직접 실행되는 경우
// ES Module에서는 import.meta.main 사용 (Node.js 20.11.0+) 또는 스크립트가 직접 실행될 때는 항상 실행
updateRepositoryFile().catch(error => {
    console.error('❌ Update Repository Script 실행 중 오류:', error.message);
    process.exit(1);
}); 