#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'akfmdl/github-actions-workflows';
const GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://api.github.com';
const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://your-jira-instance.atlassian.net';
const VERSION_PY_PATH = process.env.VERSION_PY_PATH || '';
const VERSION_PREFIX = process.env.VERSION_PREFIX || '';
const DEFAULT_RELEASE_TYPE = process.env.DEFAULT_RELEASE_TYPE || 'patch'; // 'patch' 또는 'minor'
const PATCH_VERSION_PREFIX = process.env.PATCH_VERSION_PREFIX || ''; // patch 버전에 사용할 문자열 prefix (예: 'rc', 'alpha' 등)
const INCLUDE_PATCH_FOR_MINOR = process.env.INCLUDE_PATCH_FOR_MINOR !== 'false'; // minor 릴리즈일 때 patch 버전 포함 여부 (환경변수가 없으면 기본값: true)

// DEFAULT_RELEASE_TYPE 유효성 검사
if (!['patch', 'minor'].includes(DEFAULT_RELEASE_TYPE)) {
    console.error(`❌ 잘못된 DEFAULT_RELEASE_TYPE: ${DEFAULT_RELEASE_TYPE}. 'patch' 또는 'minor'만 사용 가능합니다.`);
    process.exit(1);
}

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
        const version = lastTag.replace(/^v/, '');
        console.log(`🔍 Git describe로 가져온 마지막 태그: "${lastTag}" -> 버전: "${version}"`);
        return version;
    } catch (error) {
        try {
            console.log(`🔄 모든 태그에서 최신 버전 검색 중...`);
            const allTags = execSync('git tag --sort=-version:refname', { encoding: 'utf8' }).trim();

            if (allTags) {
                const tags = allTags.split('\n').filter(tag => tag.trim());
                if (tags.length > 0) {
                    const latestTag = tags[0];
                    const version = latestTag.replace(/^v/, '');
                    console.log(`🎯 최신 태그: ${latestTag} -> 버전: ${version}`);
                    return version;
                }
            }

            console.log(`🔧 기본 버전 사용: 2024.01.0.0`);
            return '2024.01.0.0';
        } catch (tagError) {
            console.log(`🔧 기본 버전 사용: 2024.01.0.0`);
            return '2024.01.0.0';
        }
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

function addJiraLinksToText(text) {
    // 텍스트에서 Jira 티켓 번호를 찾아서 링크로 변환
    const jiraPattern = /\[([A-Z]+-\d+)\]/g;
    return text.replace(jiraPattern, (match, ticketNumber) => {
        const jiraUrl = `${JIRA_BASE_URL}/browse/${ticketNumber}`;
        return `[[${ticketNumber}](${jiraUrl})]`;
    });
}

function determineReleaseTypeFromLabels(labels, labelMappings = DEFAULT_LABEL_MAPPINGS) {
    if (!labels || labels.length === 0) {
        return null;
    }

    const releaseTypes = ['major', 'minor', 'patch'];
    let highestReleaseType = null;
    let highestPriority = Infinity;

    for (const label of labels) {
        if (!label || typeof label !== 'string') {
            continue; // undefined, null, 또는 문자열이 아닌 라벨 건너뛰기
        }
        const releaseType = labelMappings[label.toLowerCase()];
        if (releaseType) {
            const priority = releaseTypes.indexOf(releaseType);
            if (priority < highestPriority) {
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
    releaseNotes += `---\n\n`;

    // 첫 번째 릴리즈인지 확인
    const lastVersion = getLastVersion();
    const lastTag = `v${lastVersion}`;

    try {
        // 실제 태그가 존재하는지 확인
        execSync(`git rev-parse ${lastTag}`, { encoding: 'utf8', stdio: 'ignore' });
        // 태그가 존재하면 일반적인 비교 링크
        releaseNotes += `**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${lastVersion}...${version}`;
    } catch (error) {
        // 첫 번째 릴리즈인 경우 (태그가 존재하지 않음)
        try {
            // 첫 번째 커밋 해시 가져오기
            const firstCommit = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();
            releaseNotes += `**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${firstCommit}...${version}`;
        } catch (commitError) {
            // 커밋 히스토리도 가져올 수 없는 경우 링크 생략
            releaseNotes += `**Initial Release** 🎉`;
        }
    }

    return releaseNotes;
}



async function getRecentMergedPullRequests() {
    if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
        console.log('⚠️ GitHub 토큰 또는 리포지토리 정보가 없어서 API를 사용할 수 없습니다.');
        return [];
    }

    try {
        const lastVersion = getLastVersion();
        const lastTag = `v${lastVersion}`;

        console.log(`🔍 마지막 태그 ${lastTag} 이후의 커밋들에서 PR 검색...`);

        // 마지막 태그 이후의 커밋들에서 PR 번호 추출
        const prNumbers = new Set();

        try {
            // 현재 HEAD와 마지막 태그의 커밋 해시 확인
            const currentHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
            const lastTagHash = execSync(`git rev-parse ${lastTag}`, { encoding: 'utf8' }).trim();

            console.log(`🔍 현재 HEAD: ${currentHead}`);
            console.log(`🔍 마지막 태그 ${lastTag} 해시: ${lastTagHash}`);

            if (currentHead === lastTagHash) {
                console.log(`⚠️ 현재 HEAD와 마지막 태그가 동일합니다. 새로운 커밋이 없습니다.`);
                return [];
            }

            // 마지막 태그부터 HEAD까지의 커밋 메시지 가져오기
            const commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`, { encoding: 'utf8' })
                .trim()
                .split('\n')
                .filter(line => line.trim());

            console.log(`📋 마지막 태그 이후 커밋 수: ${commits.length}개`);

            if (commits.length === 0) {
                console.log(`⚠️ 마지막 태그 ${lastTag} 이후 새로운 커밋이 없습니다.`);
                return [];
            }

            console.log(`📋 커밋 메시지들:`);
            commits.forEach((commit, index) => {
                console.log(`   ${index + 1}. ${commit}`);
            });

            for (const message of commits) {
                // 모든 #숫자 패턴을 찾아서 PR 번호로 간주
                const prMatches = message.match(/#(\d+)/g);
                if (prMatches) {
                    for (const match of prMatches) {
                        const prNum = parseInt(match.replace('#', ''), 10);
                        if (prNum && prNum > 0) {
                            console.log(`   🎯 발견된 PR 번호: #${prNum} (커밋: "${message}")`);
                            prNumbers.add(prNum);
                        }
                    }
                }
            }
        } catch (error) {
            // 태그가 없는 경우 최근 30일간의 모든 커밋 검색
            console.log(`⚠️ 태그 범위 검색 실패, 최근 30일간 커밋 검색: ${error.message}`);

            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const commits = execSync(`git log --since="${since}" --pretty=format:"%s"`, { encoding: 'utf8' })
                .trim()
                .split('\n')
                .filter(line => line.trim());

            for (const message of commits) {
                const prMatches = message.match(/#(\d+)/g);
                if (prMatches) {
                    for (const match of prMatches) {
                        const prNum = parseInt(match.replace('#', ''), 10);
                        if (prNum && prNum > 0) {
                            prNumbers.add(prNum);
                        }
                    }
                }
            }
        }

        if (prNumbers.size === 0) {
            console.log(`⚠️ 마지막 태그 이후 커밋에서 PR 번호를 찾을 수 없습니다.`);
            return [];
        }

        console.log(`🔎 발견된 PR 번호: ${Array.from(prNumbers).length}개 [${Array.from(prNumbers).sort((a, b) => b - a).slice(0, 10).join(', ')}${Array.from(prNumbers).length > 10 ? '...' : ''}]`);

        // 각 PR 정보를 API로 가져오기
        const prInfos = [];
        for (const prNumber of prNumbers) {
            try {
                const url = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls/${prNumber}`;
                const prData = await fetchWithAuth(url);

                // merged된 PR만 포함
                if (prData.merged_at) {
                    prInfos.push({
                        number: prData.number,
                        title: prData.title || 'Unknown title',
                        author: prData.user?.login || 'unknown-user',
                        labels: (prData.labels || []).map(label => label?.name).filter(name => name),
                        url: prData.html_url || '',
                        merged_at: prData.merged_at
                    });
                }
            } catch (error) {
                console.log(`⚠️ PR #${prNumber} 정보 조회 실패: ${error.message}`);
            }
        }

        console.log(`📋 최종 merged PR 수: ${prInfos.length}개`);
        return prInfos;

    } catch (error) {
        console.log(`⚠️ PR 검색 실패: ${error.message}`);
        return [];
    }
}

async function analyzePullRequestsForReleaseType() {
    console.log('🔍 PR 정보를 분석하여 릴리즈 타입을 결정합니다...');

    const prInfos = await getRecentMergedPullRequests();

    if (prInfos.length === 0) {
        console.log('🚫 분석할 PR이 없습니다.');
        console.log('💡 이는 다음 중 하나의 이유일 수 있습니다:');
        console.log('   1. 마지막 태그 이후 새로운 커밋이 없음');
        console.log('   2. 새로운 커밋이 있지만 PR 번호가 포함되지 않음');
        console.log('   3. 발견된 PR이 merged 상태가 아님');
        console.log('🔧 강제로 기본 릴리즈를 생성하려면 DEFAULT_RELEASE_TYPE을 사용합니다.');

        // 기본 릴리즈 타입으로 빈 릴리즈 생성
        return { releaseType: DEFAULT_RELEASE_TYPE, prInfos: [] };
    }

    console.log(`🔗 ${prInfos.length}개의 PR을 발견했습니다.`);

    // PR 라벨 기반으로 릴리즈 타입 결정
    let globalReleaseType = null;
    let globalPriority = Infinity;
    const releaseTypes = ['major', 'minor', 'patch'];

    for (const prInfo of prInfos) {
        console.log(`📄 PR #${prInfo.number}: "${prInfo.title}" by @${prInfo.author}`);

        const releaseType = determineReleaseTypeFromLabels(prInfo.labels);

        if (releaseType) {
            const priority = releaseTypes.indexOf(releaseType);
            if (priority < globalPriority) {
                globalPriority = priority;
                globalReleaseType = releaseType;
            }
        }
    }

    if (globalReleaseType) {
        console.log(`🎯 최종 결정된 릴리즈 타입: ${globalReleaseType}`);
    } else {
        console.log('⚪ 릴리즈와 관련된 변경사항이 없습니다.');
        globalReleaseType = DEFAULT_RELEASE_TYPE;
        console.log(`🔧 기본값으로 ${globalReleaseType} 릴리즈 사용`);
    }

    return { releaseType: globalReleaseType, prInfos };
}

function generateCalendarVersion(releaseType) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const lastVersion = getLastVersion();
    console.log(`🔍 마지막 버전: ${lastVersion}`);

    // VERSION_PREFIX 제거
    const cleanVersion = lastVersion.replace(/^[a-zA-Z]+/, '');
    const versionParts = cleanVersion.split('.');

    // 정확히 4개의 파트가 있어야 함
    while (versionParts.length < 4) {
        versionParts.push('0');
    }

    // 각 파트 파싱
    let lastYear = parseInt(versionParts[0], 10) || 2024;
    let lastMonth = parseInt(versionParts[1], 10) || 1;
    let lastMinor = parseInt(versionParts[2], 10) || 0;
    let lastFixNumber = 0;

    console.log(`🔍 현재 날짜: ${currentYear}.${currentMonth}, 릴리즈 타입: ${releaseType}`);

    // patch 버전에서 숫자 부분만 추출
    const lastFixPart = versionParts[3];

    if (PATCH_VERSION_PREFIX && lastFixPart.startsWith(PATCH_VERSION_PREFIX)) {
        lastFixNumber = parseInt(lastFixPart.substring(PATCH_VERSION_PREFIX.length), 10) || 0;
    } else if (!PATCH_VERSION_PREFIX && /^\d+$/.test(lastFixPart)) {
        lastFixNumber = parseInt(lastFixPart, 10) || 0;
    } else if (!PATCH_VERSION_PREFIX && isNaN(parseInt(lastFixPart, 10))) {
        lastFixNumber = 0;
    } else {
        lastFixNumber = parseInt(lastFixPart, 10) || 0;
    }

    let newYear = currentYear;
    let newMonth = currentMonth;
    let newMinor = 0;
    let newFixNumber = 0;

    if (currentYear !== lastYear || currentMonth !== lastMonth) {
        console.log(`🔄 년/월이 변경되어 버전 리셋`);
        newMinor = 0;
        newFixNumber = 0;
    } else {
        console.log(`✅ 같은 년/월 내에서 버전 증가`);
        if (releaseType === 'minor') {
            newMinor = (lastMinor || 0) + 1;
            newFixNumber = 0;
            console.log(`🔺 Minor 릴리즈: ${lastMinor} -> ${newMinor}`);
        } else if (releaseType === 'patch') {
            newMinor = lastMinor || 0;
            newFixNumber = (lastFixNumber || 0) + 1;
            console.log(`🔺 Patch 릴리즈: ${lastFixNumber} -> ${newFixNumber}`);
        } else {
            newMinor = lastMinor || 0;
            newFixNumber = (lastFixNumber || 0) + 1;
        }
    }

    // 버전 포맷팅
    let finalVersion;

    if (releaseType === 'minor' && !INCLUDE_PATCH_FOR_MINOR) {
        finalVersion = `${VERSION_PREFIX}${newYear}.${newMonth.toString().padStart(2, '0')}.${newMinor}`;
        console.log(`🔖 Minor release with patch version omitted: ${finalVersion}`);
    } else {
        const patchVersion = PATCH_VERSION_PREFIX ? `${PATCH_VERSION_PREFIX}${newFixNumber}` : `${newFixNumber}`;
        finalVersion = `${VERSION_PREFIX}${newYear}.${newMonth.toString().padStart(2, '0')}.${newMinor}.${patchVersion}`;
    }

    return finalVersion;
}

// calendar versioning 기반 릴리즈 생성
async function generateCalendarRelease() {
    console.log('🔄 PR 라벨 분석을 통해 릴리즈 타입을 결정합니다...');
    const analysis = await analyzePullRequestsForReleaseType();
    const releaseType = analysis.releaseType;
    const prInfos = analysis.prInfos;
    const calendarVersion = generateCalendarVersion(releaseType);

    console.log(`📅 Calendar version generated: ${calendarVersion}`);
    console.log(`🏷️ Release type: ${releaseType}`);

    // Release notes 생성
    const releaseNotes = generateReleaseNotes(prInfos, calendarVersion);
    console.log(`📝 Release notes generated`);

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
        const content = fs.readFileSync('version.py', 'utf8');
        const updatedContent = content.replace(/__VERSION__ = ".*"/, `__VERSION__ = "${calendarVersion}"`);
        fs.writeFileSync('version.py', updatedContent);
        console.log(`✅ Updated version.py with version: ${calendarVersion}`);
    }

    // Release notes를 파일로 저장
    fs.writeFileSync('RELEASE_NOTES.md', releaseNotes);
    console.log(`📄 Release notes saved to RELEASE_NOTES.md`);

    // 환경 변수로 calendar version 설정
    process.env.NEW_VERSION = calendarVersion;

    // GitHub Actions의 환경 변수로도 설정
    if (process.env.GITHUB_ENV) {
        fs.appendFileSync(process.env.GITHUB_ENV, `NEW_VERSION=${calendarVersion}\n`);
        fs.appendFileSync(process.env.GITHUB_ENV, `RELEASE_NOTES_FILE=RELEASE_NOTES.md\n`);
        console.log(`📝 Set NEW_VERSION environment variable: ${calendarVersion}`);
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

module.exports = { generateCalendarVersion, generateCalendarRelease, analyzePullRequestsForReleaseType }; 