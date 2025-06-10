#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 환경변수에서 입력값들 가져오기
const TARGET_REPO = process.env.TARGET_REPO;
const FILE_PATH = process.env.FILE_PATH;
const VARIABLE_NAME = process.env.VARIABLE_NAME;
const NEW_VALUE = process.env.NEW_VALUE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // PR 생성용
const SSH_KEY = process.env.SSH_KEY;
const COMMIT_MESSAGE = process.env.COMMIT_MESSAGE || '';
const PR_TITLE = process.env.PR_TITLE || '';
const PR_BODY = process.env.PR_BODY || '';
const SOURCE_REPOSITORY = process.env.SOURCE_REPOSITORY || 'Unknown';
const SOURCE_WORKFLOW = process.env.SOURCE_WORKFLOW || 'Unknown';
const SOURCE_RUN_ID = process.env.SOURCE_RUN_ID || '';

// ES Module 호환성을 위한 dynamic import
async function loadOctokit() {
    const { Octokit } = await import('@octokit/rest');
    return Octokit;
}

async function updateRepositoryFileSSH() {
    console.log('🔧 Update Repository File Script (SSH) v1.0.0');
    console.log('='.repeat(60));

    console.log('📋 입력값 확인:');
    console.log(`- Target Repo: ${TARGET_REPO}`);
    console.log(`- File Path: ${FILE_PATH}`);
    console.log(`- Variable Name: ${VARIABLE_NAME}`);
    console.log(`- New Value: ${NEW_VALUE}`);
    console.log(`- Source Repository: ${SOURCE_REPOSITORY}`);
    console.log(`- SSH Key: ${SSH_KEY ? 'Provided' : 'NOT PROVIDED'}`);
    console.log(`- GitHub Token: ${GITHUB_TOKEN ? `${GITHUB_TOKEN.substring(0, 8)}...` : 'NOT PROVIDED'}`);

    // 필수 입력값 검증
    if (!TARGET_REPO || !FILE_PATH || !VARIABLE_NAME || !NEW_VALUE || !SSH_KEY) {
        const missingFields = [];
        if (!TARGET_REPO) missingFields.push('TARGET_REPO');
        if (!FILE_PATH) missingFields.push('FILE_PATH');
        if (!VARIABLE_NAME) missingFields.push('VARIABLE_NAME');
        if (!NEW_VALUE) missingFields.push('NEW_VALUE');
        if (!SSH_KEY) missingFields.push('SSH_KEY');

        throw new Error(`❌ 필수 입력값이 누락되었습니다: ${missingFields.join(', ')}`);
    }

    const [owner, repo] = TARGET_REPO.split('/');
    if (!owner || !repo) {
        throw new Error('❌ 대상 레포지토리 형식이 올바르지 않습니다. (예: owner/repo-name)');
    }

    const workDir = path.join(os.tmpdir(), `repo-update-${Date.now()}`);
    const sshKeyPath = path.join(os.tmpdir(), `deploy_key_${Date.now()}`);

    try {
        // 1. SSH 키 설정
        console.log('\n🔐 SSH 키 설정 중...');
        fs.writeFileSync(sshKeyPath, SSH_KEY.replace(/\\n/g, '\n'), { mode: 0o600 });

        // SSH config 설정
        const sshConfigDir = path.join(os.homedir(), '.ssh');
        if (!fs.existsSync(sshConfigDir)) {
            fs.mkdirSync(sshConfigDir, { mode: 0o700 });
        }

        // known_hosts에 github.com 추가
        execSync('ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null', { stdio: 'ignore' });

        // Git 설정 (전역)
        execSync('git config --global user.name "github-actions[bot]"', { stdio: 'pipe' });
        execSync('git config --global user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'pipe' });

        console.log('✅ SSH 키 설정 완료');

        // 2. 레포지토리 클론
        console.log('\n📥 대상 레포지토리 클론 중...');
        fs.mkdirSync(workDir, { recursive: true });

        const sshUrl = `git@github.com:${TARGET_REPO}.git`;
        const cloneCmd = `GIT_SSH_COMMAND="ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no" git clone ${sshUrl} ${workDir}`;

        try {
            execSync(cloneCmd, { stdio: 'pipe' });
            console.log('✅ 레포지토리 클론 완료');
        } catch (cloneError) {
            console.error('❌ 레포지토리 클론 실패:', cloneError.message);
            throw new Error(`레포지토리 클론 실패. Deploy Key 권한을 확인하세요: ${cloneError.message}`);
        }

        // 3. 파일 수정
        console.log('\n🔄 파일 내용 수정 중...');
        const filePath = path.join(workDir, FILE_PATH);

        if (!fs.existsSync(filePath)) {
            throw new Error(`❌ 파일을 찾을 수 없습니다: ${FILE_PATH}`);
        }

        let originalContent = fs.readFileSync(filePath, 'utf8');
        let updatedContent = originalContent;
        let updateSuccess = false;

        console.log('📄 원본 파일 내용:');
        console.log('─'.repeat(40));
        console.log(originalContent);
        console.log('─'.repeat(40));

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

        // 파일 저장
        fs.writeFileSync(filePath, updatedContent, 'utf8');

        // 4. Git 커밋 및 푸시
        console.log('\n💾 변경사항 커밋 및 푸시 중...');

        const timestamp = Date.now();
        const branchName = `update-${VARIABLE_NAME.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`;
        const commitMessage = COMMIT_MESSAGE || `Update ${VARIABLE_NAME} to ${NEW_VALUE}`;

        process.chdir(workDir);

        // 새 브랜치 생성 및 체크아웃
        execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
        console.log(`✅ 새 브랜치 생성: ${branchName}`);

        // 변경사항 추가
        execSync(`git add "${FILE_PATH}"`, { stdio: 'pipe' });

        // 커밋
        execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
        console.log('✅ 변경사항 커밋 완료');

        // 푸시
        const pushCmd = `GIT_SSH_COMMAND="ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no" git push origin ${branchName}`;
        execSync(pushCmd, { stdio: 'pipe' });
        console.log('✅ 변경사항 푸시 완료');

        // 5. Pull Request 생성 (GitHub API 사용)
        if (GITHUB_TOKEN) {
            console.log('\n🚀 Pull Request 생성 중...');

            const Octokit = await loadOctokit();
            const octokit = new Octokit({
                auth: GITHUB_TOKEN,
            });

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

            try {
                // 기본 브랜치 확인
                const { data: repoData } = await octokit.rest.repos.get({
                    owner,
                    repo,
                });

                const { data: pullRequest } = await octokit.rest.pulls.create({
                    owner,
                    repo,
                    title: prTitle,
                    head: branchName,
                    base: repoData.default_branch,
                    body: prBody,
                });

                console.log(`✅ Pull Request 생성 완료!`);
                console.log(`🔗 PR URL: ${pullRequest.html_url}`);
                console.log(`🔢 PR Number: ${pullRequest.number}`);

                // GitHub Actions 출력 설정
                if (process.env.GITHUB_OUTPUT) {
                    fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr-url=${pullRequest.html_url}\n`);
                    fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr-number=${pullRequest.number}\n`);
                    fs.appendFileSync(process.env.GITHUB_OUTPUT, `branch-name=${branchName}\n`);
                }

                // 레거시 출력 방식
                console.log(`::set-output name=pr-url::${pullRequest.html_url}`);
                console.log(`::set-output name=pr-number::${pullRequest.number}`);
                console.log(`::set-output name=branch-name::${branchName}`);

            } catch (prError) {
                console.error('❌ Pull Request 생성 실패:', prError.message);
                console.log('⚠️ 파일 수정 및 푸시는 완료되었지만 PR 생성에 실패했습니다.');
                console.log(`📌 수동으로 PR을 생성하세요: ${branchName} -> main`);
            }
        } else {
            console.log('⚠️ GitHub Token이 제공되지 않아 PR 생성을 건너뜁니다.');
            console.log(`📌 수동으로 PR을 생성하세요: ${branchName} -> main`);
        }

        console.log('\n🎉 모든 작업이 성공적으로 완료되었습니다!');

    } catch (error) {
        console.error('\n❌ 오류 발생:', error.message);
        process.exit(1);
    } finally {
        // 정리 작업
        try {
            if (fs.existsSync(sshKeyPath)) {
                fs.unlinkSync(sshKeyPath);
            }
            if (fs.existsSync(workDir)) {
                execSync(`rm -rf ${workDir}`, { stdio: 'ignore' });
            }
        } catch (cleanupError) {
            console.warn('⚠️ 정리 작업 중 오류:', cleanupError.message);
        }
    }
}

// 정규식 특수문자 이스케이프 함수
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 스크립트 실행
updateRepositoryFileSSH().catch(error => {
    console.error('❌ SSH Update Repository Script 실행 중 오류:', error.message);
    process.exit(1);
}); 