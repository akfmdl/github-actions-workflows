#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// GitHub API를 사용하기 위한 설정
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://api.github.com';

// 라벨과 릴리즈 타입 매핑 (package.json 설정에서 가져옴)
const DEFAULT_LABEL_MAPPINGS = {
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

async function getPullRequestLabels(prNumber) {
    if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
        console.log('⚠️ GitHub 토큰 또는 리포지토리 정보가 없어서 PR 라벨을 확인할 수 없습니다.');
        return [];
    }

    try {
        const url = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls/${prNumber}`;
        console.log(`🔍 PR #${prNumber} 라벨 확인 중...`);

        const prData = await fetchWithAuth(url);
        const labels = prData.labels.map(label => label.name);

        console.log(`🏷️ PR #${prNumber} 라벨: [${labels.join(', ')}]`);
        return labels;
    } catch (error) {
        console.log(`⚠️ PR #${prNumber} 라벨 확인 실패: ${error.message}`);
        return [];
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

async function analyzeCommitsForReleaseType() {
    console.log('🔍 커밋들을 분석하여 릴리즈 타입을 결정합니다...');

    const commits = await getRecentCommits();
    console.log(`📝 분석할 커밋 수: ${commits.length}개`);

    if (commits.length === 0) {
        console.log('📭 새로운 커밋이 없습니다.');
        return null;
    }

    let globalReleaseType = null;
    let globalPriority = -1;
    const releaseTypes = ['major', 'minor', 'patch'];

    for (const commit of commits) {
        console.log(`🔎 커밋 분석: ${commit.message}`);

        const prNumber = extractPullRequestNumber(commit.message);
        if (prNumber) {
            const labels = await getPullRequestLabels(prNumber);
            const releaseType = determineReleaseTypeFromLabels(labels);

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
        } else {
            console.log('⚪ PR 번호를 찾을 수 없는 커밋');
        }
    }

    if (globalReleaseType) {
        console.log(`🎯 최종 결정된 릴리즈 타입: ${globalReleaseType}`);
    } else {
        console.log('⚪ 릴리즈와 관련된 변경사항이 없습니다.');
        globalReleaseType = 'patch'; // 기본값으로 patch 사용
        console.log(`🔧 기본값으로 ${globalReleaseType} 릴리즈 사용`);
    }

    return globalReleaseType;
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

// semantic-release가 생성한 버전을 calendar 버전으로 변환
async function overrideSemanticVersion() {
    let releaseType = process.env.SEMANTIC_RELEASE_TYPE;

    // 환경변수가 없으면 PR 라벨을 분석해서 릴리즈 타입 결정
    if (!releaseType) {
        console.log('🔄 PR 라벨 분석을 통해 릴리즈 타입을 결정합니다...');
        releaseType = await analyzeCommitsForReleaseType();
    }

    if (!releaseType) {
        releaseType = 'patch'; // 기본값
    }

    const calendarVersion = generateCalendarVersion(releaseType);

    console.log(`📅 Calendar version generated: ${calendarVersion}`);
    console.log(`🏷️ Release type: ${releaseType}`);

    // package.json의 버전을 calendar 버전으로 업데이트
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    packageJson.version = calendarVersion;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

    // version.py 파일도 업데이트
    if (fs.existsSync('version.py')) {
        const content = fs.readFileSync('version.py', 'utf8');
        const updatedContent = content.replace(/__VERSION__ = ".*"/, `__VERSION__ = "${calendarVersion}"`);
        fs.writeFileSync('version.py', updatedContent);
        console.log(`✅ Updated version.py with version: ${calendarVersion}`);
    }

    // 환경 변수로 calendar version 설정 (다른 플러그인에서 사용 가능)
    process.env.CALENDAR_VERSION = calendarVersion;
    process.env.SEMANTIC_RELEASE_TYPE = releaseType;

    // GitHub Actions의 환경 변수로도 설정
    if (process.env.GITHUB_ENV) {
        fs.appendFileSync(process.env.GITHUB_ENV, `CALENDAR_VERSION=${calendarVersion}\n`);
        fs.appendFileSync(process.env.GITHUB_ENV, `SEMANTIC_RELEASE_TYPE=${releaseType}\n`);
        console.log(`📝 Set CALENDAR_VERSION environment variable: ${calendarVersion}`);
        console.log(`📝 Set SEMANTIC_RELEASE_TYPE environment variable: ${releaseType}`);
    }

    console.log(`🚀 Calendar version ready for release: ${calendarVersion}`);
    return calendarVersion;
}

if (require.main === module) {
    overrideSemanticVersion().catch(error => {
        console.error('❌ Calendar version wrapper 실행 중 오류:', error);
        process.exit(1);
    });
}

module.exports = { generateCalendarVersion, overrideSemanticVersion, analyzeCommitsForReleaseType }; 