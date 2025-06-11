#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'akfmdl/github-actions-workflows';
const GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://api.github.com';
const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://your-jira-instance.atlassian.net';
const VERSION_PY_PATH = process.env.VERSION_PY_PATH || '';

const DEFAULT_LABEL_MAPPINGS = {
    // PR 라벨: 릴리즈 타입
    "breaking": "minor",
    "feature": "minor",
    "enhancement": "minor",
    "bug": "patch",
    "bugfix": "patch",
    "fix": "patch",
    "documentation": "patch",
    "docs": "patch",
    "chore": "patch"
};

function getLastVersion() {
    try {
        const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        return lastTag.replace(/^v/, '');
    } catch (error) {
        return '2024.01.0.0';
    }
}

async function fetchWithAuth(url) {
    const https = require('https');
    const urlModule = require('url');

    return new Promise((resolve, reject) => {
        const parsedUrl = urlModule.parse(url);

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.path,
            method: 'GET',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'calendar-version-wrapper',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e.message}`));
                    }
                } else {
                    reject(new Error(`GitHub API error: ${res.statusCode} ${res.statusMessage}\nResponse: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

async function getRecentCommits() {
    try {
        const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        const commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%H|%s"`, { encoding: 'utf8' })
            .trim()
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [hash, ...messageParts] = line.split('|');
                return { hash: hash.trim(), message: messageParts.join('|').trim() };
            });
        return commits;
    } catch (error) {
        // 첫 번째 릴리즈인 경우 모든 커밋을 가져옴
        const commits = execSync('git log --pretty=format:"%H|%s"', { encoding: 'utf8' })
            .trim()
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [hash, ...messageParts] = line.split('|');
                return { hash: hash.trim(), message: messageParts.join('|').trim() };
            });
        return commits;
    }
}

function extractPullRequestNumber(commitMessage) {
    // GitHub merge commit 패턴들을 찾음
    const patterns = [
        /Merge pull request #(\d+)/i,
        /\(#(\d+)\)$/,
        /#(\d+)$/
    ];

    for (const pattern of patterns) {
        const match = commitMessage.match(pattern);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return null;
}

function addJiraLinksToText(text) {
    // 텍스트에서 Jira 티켓 번호를 찾아서 링크로 변환
    const jiraPattern = /\[([A-Z]+-\d+)\]/g;

    return text.replace(jiraPattern, (match, ticketNumber) => {
        const jiraUrl = `${JIRA_BASE_URL}/browse/${ticketNumber}`;
        return `[[${ticketNumber}](${jiraUrl})]`;
    });
}

async function getPullRequestInfo(prNumber) {
    if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
        console.log('⚠️ GitHub 토큰 또는 리포지토리 정보가 없어서 PR 정보를 확인할 수 없습니다.');
        return null;
    }

    try {
        const url = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls/${prNumber}`;
        console.log(`🔍 PR #${prNumber} 정보 확인 중...`);

        const prData = await fetchWithAuth(url);
        const labels = prData.labels.map(label => label.name);

        const prInfo = {
            number: prNumber,
            title: prData.title,
            author: prData.user.login,
            labels: labels,
            url: prData.html_url
        };

        console.log(`📄 PR #${prNumber}: "${prInfo.title}" by @${prInfo.author}`);
        console.log(`🏷️ PR #${prNumber} 라벨: [${labels.join(', ')}]`);

        return prInfo;
    } catch (error) {
        console.log(`⚠️ PR #${prNumber} 정보 확인 실패: ${error.message}`);
        return null;
    }
}

function determineReleaseTypeFromLabels(labels, labelMappings = DEFAULT_LABEL_MAPPINGS) {
    if (!labels || labels.length === 0) {
        return null;
    }

    // 우선순위: major > minor > patch
    const releaseTypes = ['major', 'minor', 'patch'];
    let highestReleaseType = null;
    let highestPriority = -1;

    for (const label of labels) {
        const releaseType = labelMappings[label.toLowerCase()];
        if (releaseType) {
            const priority = releaseTypes.indexOf(releaseType);
            if (priority > highestPriority) {
                highestPriority = priority;
                highestReleaseType = releaseType;
            }
        }
    }

    return highestReleaseType;
}

function generateReleaseNotes(prInfos, version) {
    if (!prInfos || prInfos.length === 0) {
        return `# Release ${version}\n\nNo pull requests found for this release.`;
    }

    // 라벨별로 PR 분류
    const features = [];
    const bugfixes = [];
    const docs = [];
    const others = [];

    for (const pr of prInfos) {
        const hasFeatureLabel = pr.labels.some(label =>
            ['feature', 'enhancement', 'breaking'].includes(label.toLowerCase())
        );
        const hasBugLabel = pr.labels.some(label =>
            ['bug', 'bugfix', 'fix'].includes(label.toLowerCase())
        );
        const hasDocsLabel = pr.labels.some(label =>
            ['documentation', 'docs'].includes(label.toLowerCase())
        );

        if (hasFeatureLabel) {
            features.push(pr);
        } else if (hasBugLabel) {
            bugfixes.push(pr);
        } else if (hasDocsLabel) {
            docs.push(pr);
        } else {
            others.push(pr);
        }
    }

    let releaseNotes = ``;

    // Features 섹션
    if (features.length > 0) {
        releaseNotes += `## 🚀 Features\n\n`;
        for (const pr of features) {
            const titleWithJiraLinks = addJiraLinksToText(pr.title);
            releaseNotes += `- ${titleWithJiraLinks} ([#${pr.number}](${pr.url})) [@${pr.author}](https://github.com/${pr.author})\n`;
        }
        releaseNotes += '\n';
    }

    // Bug Fixes 섹션
    if (bugfixes.length > 0) {
        releaseNotes += `## 🐛 Bug Fixes\n\n`;
        for (const pr of bugfixes) {
            const titleWithJiraLinks = addJiraLinksToText(pr.title);
            releaseNotes += `- ${titleWithJiraLinks} ([#${pr.number}](${pr.url})) [@${pr.author}](https://github.com/${pr.author})\n`;
        }
        releaseNotes += '\n';
    }

    // Documentation 섹션
    if (docs.length > 0) {
        releaseNotes += `## 📚 Documentation\n\n`;
        for (const pr of docs) {
            const titleWithJiraLinks = addJiraLinksToText(pr.title);
            releaseNotes += `- ${titleWithJiraLinks} ([#${pr.number}](${pr.url})) [@${pr.author}](https://github.com/${pr.author})\n`;
        }
        releaseNotes += '\n';
    }

    // Other Changes 섹션
    if (others.length > 0) {
        releaseNotes += `## 🔧 Other Changes\n\n`;
        for (const pr of others) {
            const titleWithJiraLinks = addJiraLinksToText(pr.title);
            releaseNotes += `- ${titleWithJiraLinks} ([#${pr.number}](${pr.url})) [@${pr.author}](https://github.com/${pr.author})\n`;
        }
        releaseNotes += '\n';
    }

    // 기여자 목록
    const contributors = [...new Set(prInfos.map(pr => pr.author))];
    if (contributors.length > 0) {
        releaseNotes += `## 👥 Contributors\n\n`;
        releaseNotes += `Thank you to all contributors: ${contributors.map(c => `[@${c}](https://github.com/${c})`).join(', ')}\n\n`;
    }

    // 전체 변경사항 링크
    releaseNotes += `---\n\n**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/v${getLastVersion()}...v${version}`;

    return releaseNotes;
}

async function analyzeCommitsForReleaseType() {
    console.log('🔍 커밋들을 분석하여 릴리즈 타입을 결정합니다...');

    const commits = await getRecentCommits();
    console.log(`📝 분석할 커밋 수: ${commits.length}개`);

    if (commits.length === 0) {
        console.log('📭 새로운 커밋이 없습니다.');
        return { releaseType: null, prInfos: [] };
    }

    let globalReleaseType = null;
    let globalPriority = -1;
    let foundPRCommits = false;
    const prInfos = [];
    const releaseTypes = ['major', 'minor', 'patch'];

    for (const commit of commits) {
        console.log(`🔎 커밋 분석: ${commit.message}`);

        const prNumber = extractPullRequestNumber(commit.message);
        if (prNumber) {
            foundPRCommits = true;
            const prInfo = await getPullRequestInfo(prNumber);

            if (prInfo) {
                prInfos.push(prInfo);
                const releaseType = determineReleaseTypeFromLabels(prInfo.labels);

                if (releaseType) {
                    console.log(`✅ PR #${prNumber}: ${releaseType} 릴리즈`);

                    const priority = releaseTypes.indexOf(releaseType);
                    if (priority > globalPriority) {
                        globalPriority = priority;
                        globalReleaseType = releaseType;
                    }
                } else {
                    console.log(`⚪ PR #${prNumber}: 릴리즈와 관련된 라벨 없음`);
                }
            }
        } else {
            console.log('⚪ PR 번호를 찾을 수 없는 커밋');
        }
    }

    // PR 번호를 찾을 수 있는 커밋이 하나도 없으면 릴리즈 하지 않음
    if (!foundPRCommits) {
        console.log('🚫 PR 번호를 찾을 수 있는 커밋이 없어서 릴리즈를 건너뜁니다.');
        return { releaseType: null, prInfos: [] };
    }

    if (globalReleaseType) {
        console.log(`🎯 최종 결정된 릴리즈 타입: ${globalReleaseType}`);
    } else {
        console.log('⚪ 릴리즈와 관련된 변경사항이 없습니다.');
        globalReleaseType = 'patch'; // 기본값으로 patch 사용
        console.log(`🔧 기본값으로 ${globalReleaseType} 릴리즈 사용`);
    }

    return { releaseType: globalReleaseType, prInfos };
}

function generateCalendarVersion(releaseType) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const lastVersion = getLastVersion();
    const versionParts = lastVersion.split('.');

    while (versionParts.length < 4) {
        versionParts.push('0');
    }

    const [lastYear, lastMonth, lastMinor, lastFix] = versionParts.map(n => parseInt(n, 10));

    let newYear = currentYear;
    let newMonth = currentMonth;
    let newMinor = 0;
    let newFix = 0;

    if (currentYear !== lastYear || currentMonth !== lastMonth) {
        newMinor = 0;
        newFix = 0;
    } else {
        if (releaseType === 'minor') {
            newMinor = (lastMinor || 0) + 1;
            newFix = 0;
        } else if (releaseType === 'patch') {
            newMinor = lastMinor || 0;
            newFix = (lastFix || 0) + 1;
        }
    }

    return `${newYear}.${newMonth.toString().padStart(2, '0')}.${newMinor}.${newFix}`;
}

// calendar versioning 기반 릴리즈 생성
async function generateCalendarRelease() {
    let releaseType = process.env.SEMANTIC_RELEASE_TYPE;
    let prInfos = [];

    // 환경변수가 없으면 PR 라벨을 분석해서 릴리즈 타입 결정
    if (!releaseType) {
        console.log('🔄 PR 라벨 분석을 통해 릴리즈 타입을 결정합니다...');
        const analysis = await analyzeCommitsForReleaseType();
        releaseType = analysis.releaseType;
        prInfos = analysis.prInfos;
    }

    // 릴리즈 타입이 null이면 릴리즈를 하지 않음
    if (!releaseType) {
        console.log('⏹️ 릴리즈할 변경사항이 없어서 프로세스를 종료합니다.');

        // GitHub Actions의 output 설정 (릴리즈 없음)
        if (process.env.GITHUB_OUTPUT) {
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-published=false\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-version=\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-git-tag=\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-git-head=\n`);
            console.log(`📤 Set GitHub Action outputs: new-release-published=false`);
        }

        process.exit(0);
    }

    const calendarVersion = generateCalendarVersion(releaseType);

    console.log(`📅 Calendar version generated: ${calendarVersion}`);
    console.log(`🏷️ Release type: ${releaseType}`);

    // Release notes 생성
    const releaseNotes = generateReleaseNotes(prInfos, calendarVersion);
    console.log(`📝 Release notes generated (${releaseNotes.split('\n').length}`);
    console.log('📝 Release notes 내용:');
    console.log('='.repeat(80));
    console.log(releaseNotes);
    console.log('='.repeat(80));

    // package.json의 버전을 calendar 버전으로 업데이트
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    packageJson.version = calendarVersion;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    console.log(`✅ Updated package.json with version: ${calendarVersion}`);

    // version.py 파일도 업데이트 (경로가 지정된 경우)
    if (VERSION_PY_PATH && fs.existsSync(VERSION_PY_PATH)) {
        const content = fs.readFileSync(VERSION_PY_PATH, 'utf8');
        const updatedContent = content.replace(/__VERSION__ = ".*"/, `__VERSION__ = "${calendarVersion}"`);
        fs.writeFileSync(VERSION_PY_PATH, updatedContent);
        console.log(`✅ Updated ${VERSION_PY_PATH} with version: ${calendarVersion}`);
    } else if (!VERSION_PY_PATH && fs.existsSync('version.py')) {
        // 기본 경로 체크 (하위 호환성)
        const content = fs.readFileSync('version.py', 'utf8');
        const updatedContent = content.replace(/__VERSION__ = ".*"/, `__VERSION__ = "${calendarVersion}"`);
        fs.writeFileSync('version.py', updatedContent);
        console.log(`✅ Updated version.py with version: ${calendarVersion}`);
    }

    // Release notes를 파일로 저장
    fs.writeFileSync('RELEASE_NOTES.md', releaseNotes);
    console.log(`📄 Release notes saved to RELEASE_NOTES.md`);

    // 환경 변수로 calendar version 설정 (다른 플러그인이나 다음 워크플로우에서 사용 가능)
    process.env.NEW_VERSION = calendarVersion;
    process.env.SEMANTIC_RELEASE_TYPE = releaseType;

    // GitHub Actions의 환경 변수로도 설정
    if (process.env.GITHUB_ENV) {
        fs.appendFileSync(process.env.GITHUB_ENV, `NEW_VERSION=${calendarVersion}\n`);
        fs.appendFileSync(process.env.GITHUB_ENV, `SEMANTIC_RELEASE_TYPE=${releaseType}\n`);
        fs.appendFileSync(process.env.GITHUB_ENV, `RELEASE_NOTES_FILE=RELEASE_NOTES.md\n`);
        console.log(`📝 Set NEW_VERSION environment variable: ${calendarVersion}`);
        console.log(`📝 Set SEMANTIC_RELEASE_TYPE environment variable: ${releaseType}`);
        console.log(`📝 Set RELEASE_NOTES_FILE environment variable: RELEASE_NOTES.md`);
    }

    // GitHub Actions의 output 설정
    if (process.env.GITHUB_OUTPUT) {
        const gitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        const gitTag = `v${calendarVersion}`;

        fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-published=true\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-version=${calendarVersion}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-git-tag=${gitTag}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `new-release-git-head=${gitHash}\n`);

        console.log(`📤 Set GitHub Action outputs:`);
        console.log(`   - new-release-published: true`);
        console.log(`   - new-release-version: ${calendarVersion}`);
        console.log(`   - new-release-git-tag: ${gitTag}`);
        console.log(`   - new-release-git-head: ${gitHash}`);
    }

    console.log(`🚀 Calendar version ready for release: ${calendarVersion}`);
    return { calendarVersion, releaseType, prInfos, releaseNotes };
}

if (require.main === module) {
    generateCalendarRelease().catch(error => {
        console.error('❌ Calendar version wrapper 실행 중 오류:', error);
        process.exit(1);
    });
}

module.exports = { generateCalendarVersion, generateCalendarRelease, analyzeCommitsForReleaseType }; 