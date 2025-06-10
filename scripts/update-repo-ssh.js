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

// GitHub CLI 기반으로 변경되어 Octokit 불필요

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

        // SSH 키 상세 분석
        console.log('🔍 원본 SSH 키 분석:');
        console.log(`- 원본 길이: ${SSH_KEY.length} characters`);
        console.log(`- 원본 시작 (50자): ${SSH_KEY.substring(0, 50)}...`);
        console.log(`- \\n 포함 여부: ${SSH_KEY.includes('\\n')}`);
        console.log(`- 실제 줄바꿈 포함 여부: ${SSH_KEY.includes('\n')}`);

        // SSH 키 정리
        let cleanedSshKey = SSH_KEY;

        // GitHub Actions secrets에서 \n이 \\n으로 이스케이프될 수 있음
        if (SSH_KEY.includes('\\n')) {
            cleanedSshKey = cleanedSshKey.replace(/\\n/g, '\n');
            console.log('🔄 \\n을 실제 줄바꿈으로 변환했습니다.');
        }

        // 앞뒤 공백 제거
        cleanedSshKey = cleanedSshKey.trim();

        // 키가 올바른 형식인지 확인
        if (!cleanedSshKey.includes('-----BEGIN') || !cleanedSshKey.includes('-----END')) {
            console.error('❌ SSH 키에 BEGIN/END 헤더가 없습니다.');
            console.error('현재 키 내용 (처음 200자):', cleanedSshKey.substring(0, 200));
            throw new Error('❌ SSH 키 형식이 올바르지 않습니다. PEM 형식의 SSH 키가 필요합니다.');
        }

        // 키 시작과 끝에 줄바꿈 확인
        if (!cleanedSshKey.endsWith('\n')) {
            cleanedSshKey += '\n';
        }

        // 정리된 키 상세 정보
        console.log('📝 정리된 SSH 키 상세 정보:');
        console.log(`- 정리된 길이: ${cleanedSshKey.length} characters`);
        console.log(`- 정리된 시작 (50자): ${cleanedSshKey.substring(0, 50)}...`);

        // 키 타입 확인
        let keyType = 'Unknown';
        if (cleanedSshKey.includes('BEGIN OPENSSH PRIVATE KEY')) keyType = 'OpenSSH';
        else if (cleanedSshKey.includes('BEGIN RSA PRIVATE KEY')) keyType = 'RSA';
        else if (cleanedSshKey.includes('BEGIN EC PRIVATE KEY')) keyType = 'EC';
        else if (cleanedSshKey.includes('BEGIN PRIVATE KEY')) keyType = 'PKCS#8';

        console.log(`- 키 타입: ${keyType}`);
        console.log(`- 총 줄 수: ${cleanedSshKey.split('\n').length}`);

        // 키 저장
        fs.writeFileSync(sshKeyPath, cleanedSshKey, { mode: 0o600 });
        console.log(`✅ SSH 키를 ${sshKeyPath}에 저장했습니다.`);

        // 저장된 키 재검증
        const savedKey = fs.readFileSync(sshKeyPath, 'utf8');
        console.log('🔄 저장된 키 재검증:');
        console.log(`- 저장된 키 길이: ${savedKey.length}`);
        console.log(`- 저장된 키와 원본 일치: ${savedKey === cleanedSshKey}`);

        // ssh-keygen으로 키 유효성 검증
        console.log('🧪 ssh-keygen으로 키 유효성 검증 중...');
        try {
            const keygenResult = execSync(`ssh-keygen -l -f ${sshKeyPath}`, {
                stdio: 'pipe',
                timeout: 5000
            });
            console.log('✅ SSH 키 검증 성공:', keygenResult.toString().trim());
        } catch (keygenError) {
            console.error('❌ SSH 키 검증 실패:', keygenError.stderr?.toString() || keygenError.message);
            console.error('⚠️ 키 형식에 문제가 있을 수 있습니다. 하지만 진행을 시도합니다...');
        }

        // SSH config 설정
        const sshConfigDir = path.join(os.homedir(), '.ssh');
        if (!fs.existsSync(sshConfigDir)) {
            fs.mkdirSync(sshConfigDir, { mode: 0o700 });
        }

        // known_hosts에 github.com 추가
        console.log('🔑 GitHub 호스트 키 추가 중...');
        execSync('ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null', { stdio: 'ignore' });

        // Git 설정 (전역)
        console.log('⚙️ Git 설정 중...');
        execSync('git config --global user.name "github-actions[bot]"', { stdio: 'pipe' });
        execSync('git config --global user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'pipe' });

        // SSH 연결 테스트
        console.log('🧪 SSH 연결 테스트 중...');
        try {
            const testCmd = `GIT_SSH_COMMAND="ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -v" ssh -T git@github.com`;
            const testResult = execSync(testCmd, {
                stdio: 'pipe',
                timeout: 10000,
                encoding: 'utf8'
            });
            console.log('✅ SSH 연결 테스트 성공');
        } catch (testError) {
            console.log('⚠️ SSH 연결 테스트 결과:');
            console.log('- stdout:', testError.stdout?.toString() || 'N/A');
            console.log('- stderr:', testError.stderr?.toString() || 'N/A');

            // GitHub에서는 SSH 테스트 시 "successfully authenticated" 메시지와 함께 exit code 1을 반환하므로 정상
            const stderr = testError.stderr?.toString() || '';
            if (stderr.includes('successfully authenticated')) {
                console.log('✅ SSH 인증 성공 확인됨');
            } else if (stderr.includes('Permission denied')) {
                console.error('❌ SSH 인증 실패 - Deploy Key 설정을 확인하세요');
            }
        }

        console.log('✅ SSH 키 설정 완료');

        // 2. 레포지토리 클론
        console.log('\n📥 대상 레포지토리 클론 중...');
        fs.mkdirSync(workDir, { recursive: true });

        const sshUrl = `git@github.com:${TARGET_REPO}.git`;
        const cloneCmd = `GIT_SSH_COMMAND="ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" git clone ${sshUrl} ${workDir}`;

        console.log('📋 클론 명령어:', cloneCmd);
        console.log('📁 작업 디렉토리:', workDir);

        try {
            const cloneResult = execSync(cloneCmd, {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 30000 // 30초 타임아웃
            });
            console.log('✅ 레포지토리 클론 완료');
            if (cloneResult.toString()) {
                console.log('📄 클론 결과:', cloneResult.toString());
            }
        } catch (cloneError) {
            console.error('❌ 레포지토리 클론 실패');
            console.error('📊 에러 상세 정보:');
            console.error('- 명령어:', cloneCmd);
            console.error('- 에러 메시지:', cloneError.message);
            console.error('- stdout:', cloneError.stdout?.toString() || 'N/A');
            console.error('- stderr:', cloneError.stderr?.toString() || 'N/A');
            console.error('- 상태 코드:', cloneError.status || 'N/A');

            // SSH 키 파일 존재 확인
            console.error('🔍 SSH 키 파일 확인:');
            console.error(`- 파일 존재: ${fs.existsSync(sshKeyPath)}`);
            if (fs.existsSync(sshKeyPath)) {
                const stats = fs.statSync(sshKeyPath);
                console.error(`- 파일 권한: ${stats.mode.toString(8)}`);
                console.error(`- 파일 크기: ${stats.size} bytes`);
            }

            // 에러 분석 및 해결 방법 제시
            const errorMsg = cloneError.stderr?.toString() || cloneError.message || '';
            let troubleshooting = '📋 문제 해결 방법:\n';

            if (errorMsg.includes('Permission denied (publickey)')) {
                troubleshooting += '1. Deploy Key가 대상 레포지토리에 올바르게 추가되었는지 확인\n';
                troubleshooting += '2. Deploy Key에 "Write access" 권한이 활성화되었는지 확인\n';
                troubleshooting += '3. SSH 키가 올바른 형식(PEM)인지 확인\n';
            }

            if (errorMsg.includes('error in libcrypto')) {
                troubleshooting += '1. SSH 키 형식이 올바른지 확인 (ed25519 또는 RSA)\n';
                troubleshooting += '2. SSH 키에 줄바꿈 문자가 올바르게 포함되었는지 확인\n';
                troubleshooting += '3. GitHub Secrets에 키를 저장할 때 공백이나 특수문자가 포함되지 않았는지 확인\n';
            }

            if (errorMsg.includes('Repository not found')) {
                troubleshooting += '1. 레포지토리 이름이 올바른지 확인 (owner/repo-name)\n';
                troubleshooting += '2. 레포지토리가 존재하고 접근 가능한지 확인\n';
            }

            console.error(troubleshooting);

            throw new Error(`레포지토리 클론 실패. Deploy Key 설정을 확인하세요.\n${troubleshooting}`);
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

        // 5. Pull Request 생성 (GitHub CLI 사용 - SSH 키 기반)
        console.log('\n🚀 GitHub CLI로 Pull Request 생성 중...');

        // GitHub CLI 설치 확인
        try {
            const ghVersion = execSync('gh --version', { stdio: 'pipe', timeout: 5000 });
            console.log('✅ GitHub CLI 확인:', ghVersion.toString().trim().split('\n')[0]);
        } catch (ghError) {
            console.error('❌ GitHub CLI를 찾을 수 없습니다. GitHub CLI가 설치되어 있는지 확인하세요.');
            console.log('⚠️ PR 생성을 건너뛰고 수동으로 생성하세요.');
            console.log(`📌 수동 PR 생성: ${branchName} -> main`);
            return;
        }

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
            // GitHub CLI로 SSH 키 인증 상태 확인
            console.log('🔐 GitHub CLI 인증 상태 확인 중...');
            const authStatus = execSync('gh auth status', {
                stdio: 'pipe',
                timeout: 10000,
                env: {
                    ...process.env,
                    GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`
                }
            });
            console.log('✅ GitHub CLI 인증 상태:', authStatus.toString().trim());
        } catch (authError) {
            console.log('⚠️ GitHub CLI 인증 설정 중...');
            try {
                // SSH 키로 GitHub CLI 인증 설정
                const authCmd = `echo "github.com" | GIT_SSH_COMMAND="ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no" gh auth login --with-token --git-protocol ssh`;
                execSync(authCmd, {
                    stdio: 'pipe',
                    timeout: 10000,
                    input: '',
                    env: {
                        ...process.env,
                        GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`
                    }
                });
                console.log('✅ GitHub CLI SSH 인증 설정 완료');
            } catch (setupError) {
                console.error('❌ GitHub CLI 인증 설정 실패:', setupError.message);
                // GitHub Token이 있으면 fallback으로 사용
                if (GITHUB_TOKEN) {
                    console.log('🔄 GitHub Token으로 fallback 시도 중...');
                    const tokenAuth = execSync(`echo "${GITHUB_TOKEN}" | gh auth login --with-token`, {
                        stdio: 'pipe',
                        timeout: 10000
                    });
                    console.log('✅ GitHub Token으로 인증 완료');
                } else {
                    throw new Error('GitHub CLI 인증 실패 및 GitHub Token 없음');
                }
            }
        }

        // PR 생성
        console.log('📝 Pull Request 생성 중...');
        const ghPrCmd = `gh pr create --title "${prTitle}" --body "${prBody}" --head ${branchName}`;

        try {
            const prResult = execSync(ghPrCmd, {
                stdio: 'pipe',
                timeout: 30000,
                env: {
                    ...process.env,
                    GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`
                },
                cwd: workDir
            });

            const prUrl = prResult.toString().trim();
            console.log(`✅ Pull Request 생성 완료!`);
            console.log(`🔗 PR URL: ${prUrl}`);

            // PR 번호 추출
            const prNumber = prUrl.match(/\/pull\/(\d+)$/)?.[1] || 'N/A';
            console.log(`🔢 PR Number: ${prNumber}`);

            // GitHub Actions 출력 설정
            if (process.env.GITHUB_OUTPUT) {
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr-url=${prUrl}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `pr-number=${prNumber}\n`);
                fs.appendFileSync(process.env.GITHUB_OUTPUT, `branch-name=${branchName}\n`);
            }

            // 레거시 출력 방식
            console.log(`::set-output name=pr-url::${prUrl}`);
            console.log(`::set-output name=pr-number::${prNumber}`);
            console.log(`::set-output name=branch-name::${branchName}`);

        } catch (prError) {
            console.error('❌ Pull Request 생성 실패:', prError.message);
            console.error('- stdout:', prError.stdout?.toString() || 'N/A');
            console.error('- stderr:', prError.stderr?.toString() || 'N/A');
            console.log('⚠️ 파일 수정 및 푸시는 완료되었지만 PR 생성에 실패했습니다.');
            console.log(`📌 수동으로 PR을 생성하세요: ${branchName} -> main`);
            console.log(`🔗 GitHub에서 직접 생성: https://github.com/${TARGET_REPO}/compare/main...${branchName}`);
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