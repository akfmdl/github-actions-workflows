#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'akfmdl/github-actions-workflows';
const GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://api.github.com';
const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://your-jira-instance.atlassian.net';
const VERSION_PY_PATH = process.env.VERSION_PY_PATH || '';
const VERSION_PREFIX = process.env.VERSION_PREFIX || '';
const DEFAULT_RELEASE_TYPE = process.env.DEFAULT_RELEASE_TYPE || 'patch'; // 'patch', 'minor', 또는 'post'
const INCLUDE_PATCH_FOR_MINOR = process.env.INCLUDE_PATCH_FOR_MINOR !== 'false'; // minor 릴리즈일 때 patch 버전 포함 여부 (환경변수가 없으면 기본값: true)
const LABEL_MAPPINGS = process.env.LABEL_MAPPINGS || null;

// DEFAULT_RELEASE_TYPE 유효성 검사
if (!['patch', 'minor', 'post'].includes(DEFAULT_RELEASE_TYPE)) {
    console.error(`❌ 잘못된 DEFAULT_RELEASE_TYPE: ${DEFAULT_RELEASE_TYPE}. 'patch', 'minor', 또는 'post'만 사용 가능합니다.`);
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
    "chore": "patch",
    "post-release": "post"
};

// 환경변수에서 라벨 매핑 설정 읽기
function getLabelMappings() {
    if (LABEL_MAPPINGS) {
        try {
            const parsedMappings = JSON.parse(LABEL_MAPPINGS);
            console.log('🔧 환경변수에서 커스텀 라벨 매핑을 로드했습니다:', parsedMappings);
            return parsedMappings;
        } catch (error) {
            console.error('❌ LABEL_MAPPINGS 환경변수 파싱 실패:', error.message);
            console.log('🔧 기본 라벨 매핑을 사용합니다.');
        }
    }

    return DEFAULT_LABEL_MAPPINGS;
}

function getLastVersion() {
    try {
        const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        const version = lastTag.replace(/^[a-zA-Z-]*/, ''); // 모든 prefix 제거
        console.log(`🔍 Git describe로 가져온 마지막 태그: "${lastTag}" -> 버전: "${version}"`);
        return { version, tag: lastTag };
    } catch (error) {
        try {
            console.log(`🔄 모든 태그에서 최신 버전 검색 중...`);
            const allTags = execSync('git tag --sort=-version:refname', { encoding: 'utf8' }).trim();

            if (allTags) {
                const tags = allTags.split('\n').filter(tag => tag.trim());
                if (tags.length > 0) {
                    const latestTag = tags[0];
                    const version = latestTag.replace(/^[a-zA-Z-]*/, ''); // 모든 prefix 제거
                    console.log(`🎯 최신 태그: ${latestTag} -> 버전: ${version}`);
                    return { version, tag: latestTag };
                }
            }

            console.log(`🔧 기본 버전 사용: 2024.01.0.0`);
            return { version: '2024.01.0.0', tag: null };
        } catch (tagError) {
            console.log(`🔧 기본 버전 사용: 2024.01.0.0`);
            return { version: '2024.01.0.0', tag: null };
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
    // [ZQZT-502] 또는 [ZQZT-502, ZQZT-493] 같은 형태 모두 처리
    const bracketPattern = /\[([^\]]+)\]/g;

    return text.replace(bracketPattern, (match, content) => {
        // 대괄호 안의 내용에서 Jira 티켓 번호들을 찾음 (콤마, 공백, 세미콜론 등으로 구분 가능)
        const ticketPattern = /([A-Z]+-\d+)/g;
        const tickets = content.match(ticketPattern);

        if (tickets && tickets.length > 0) {
            // 각 티켓을 링크로 변환
            const linkedTickets = tickets.map(ticketNumber => {
                const jiraUrl = `${JIRA_BASE_URL}/browse/${ticketNumber}`;
                return `[${ticketNumber}](${jiraUrl})`;
            });

            // 여러 개인 경우 콤마로 구분하여 결합
            return `[${linkedTickets.join(', ')}]`;
        }

        // Jira 티켓이 없으면 원본 그대로 반환
        return match;
    });
}

function searchPRNumbersInRecentCommits(prNumbers, days = 30) {
    // 최근 N일간의 커밋에서 PR 번호 검색
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const commits = execSync(`git log --since="${since}" --pretty=format:"%s"`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(line => line.trim());

    console.log(`📋 최근 ${days}일간 커밋 수: ${commits.length}개`);

    for (const message of commits) {
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
}

function determineReleaseTypeFromLabels(labels, labelMappings = null) {
    if (!labelMappings) {
        labelMappings = getLabelMappings();
    }
    if (!labels || labels.length === 0) {
        return null;
    }

    const releaseTypes = ['major', 'minor', 'patch', 'post'];
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

function generateReleaseNotes(prInfos, version, lastTag = null) {
    if (!prInfos || prInfos.length === 0) {
        return `# Release ${version}\n\nNo pull requests found for this release.`;
    }

    // 라벨별로 PR 분류
    const features = [];
    const bugfixes = [];
    const docs = [];
    const postReleases = [];
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
        const hasPostReleaseLabel = pr.labels.some(label =>
            label.toLowerCase() === 'post-release'
        );

        if (hasPostReleaseLabel) {
            postReleases.push(pr);
        } else if (hasFeatureLabel) {
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

    // Post-Release 섹션 (가장 위에 표시)
    if (postReleases.length > 0) {
        releaseNotes += `## 🏥 Post-Release Fixes\n\n`;
        for (const pr of postReleases) {
            const titleWithJiraLinks = addJiraLinksToText(pr.title);
            releaseNotes += `- ${titleWithJiraLinks} ([#${pr.number}](${pr.url})) [@${pr.author}](https://github.com/${pr.author})\n`;
        }
        releaseNotes += '\n';
    }

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

    if (lastTag) {
        // 태그가 존재하면 일반적인 비교 링크
        releaseNotes += `**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${lastTag}...${version}`;
    } else {
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
        const lastVersionInfo = getLastVersion();
        const lastTag = lastVersionInfo.tag;

        // 마지막 태그 이후의 커밋들에서 PR 번호 추출
        const prNumbers = new Set();

        if (lastTag) {
            console.log(`🔍 마지막 태그 ${lastTag} 이후의 커밋들에서 PR 검색...`);

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
                // 태그 범위 검색 실패 시 최근 30일간 커밋 검색
                console.log(`⚠️ 태그 범위 검색 실패, 최근 30일간 커밋 검색: ${error.message}`);
                searchPRNumbersInRecentCommits(prNumbers, 30);
            }
        } else {
            // 태그가 없는 경우 최근 30일간 커밋 검색
            console.log(`⚠️ 태그가 없으므로 최근 30일간 커밋 검색...`);
            searchPRNumbersInRecentCommits(prNumbers, 30);
        }

        // GitHub API를 통해 최근 merged PR들도 가져오기 (squash merge 대응)
        console.log(`🌐 GitHub API를 통해 최근 merged PR들 검색...`);

        let sinceDate = null;
        if (lastTag) {
            try {
                // 마지막 태그의 커밋 날짜 가져오기
                const tagDate = execSync(`git log -1 --format=%ci ${lastTag}`, { encoding: 'utf8' }).trim();
                sinceDate = new Date(tagDate).toISOString();
                console.log(`📅 마지막 태그 ${lastTag} 날짜: ${sinceDate}`);
            } catch (error) {
                console.log(`⚠️ 태그 날짜 조회 실패: ${error.message}`);
            }
        }

        if (!sinceDate) {
            // 태그 날짜를 가져올 수 없으면 최근 7일로 설정
            sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            console.log(`📅 기본값으로 최근 7일 사용: ${sinceDate}`);
        }

        try {
            const apiUrl = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls?state=closed&sort=updated&direction=desc&per_page=100`;
            const allPRs = await fetchWithAuth(apiUrl);

            const recentMergedPRs = allPRs.filter(pr => {
                if (!pr.merged_at) return false;

                const mergedDate = new Date(pr.merged_at);
                const sinceDateTime = new Date(sinceDate);

                return mergedDate > sinceDateTime;
            });

            console.log(`🔍 API에서 발견된 최근 merged PR: ${recentMergedPRs.length}개`);

            // 커밋 메시지에서 찾은 PR과 API에서 찾은 PR 합치기
            for (const pr of recentMergedPRs) {
                prNumbers.add(pr.number);
            }

        } catch (error) {
            console.log(`⚠️ GitHub API PR 검색 실패: ${error.message}`);
        }

        if (prNumbers.size === 0) {
            console.log(`⚠️ 커밋 메시지와 GitHub API에서 PR을 찾을 수 없습니다.`);
            return [];
        }

        console.log(`🔎 최종 발견된 PR 번호: ${Array.from(prNumbers).length}개 [${Array.from(prNumbers).sort((a, b) => b - a).slice(0, 10).join(', ')}${Array.from(prNumbers).length > 10 ? '...' : ''}]`);

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
    const releaseTypes = ['major', 'minor', 'patch', 'post'];

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

    const lastVersionInfo = getLastVersion();
    const lastVersion = lastVersionInfo.version;
    console.log(`🔍 마지막 버전: ${lastVersion}`);

    // post-release 처리: 기존 버전에 .postN 추가
    if (releaseType === 'post') {
        console.log(`🔄 Post-release 버전 생성`);

        // 현재 버전이 이미 post-release 버전인지 확인
        const postMatch = lastVersion.match(/^(.+)\.post(\d+)$/);

        if (postMatch) {
            // 이미 post-release 버전인 경우, post 번호만 증가
            const baseVersion = postMatch[1];
            const postNumber = parseInt(postMatch[2], 10) + 1;
            const finalVersion = `${VERSION_PREFIX}${baseVersion}.post${postNumber}`;
            console.log(`🔺 Post-release 번호 증가: post${postMatch[2]} -> post${postNumber}`);
            return finalVersion;
        } else {
            // 일반 버전에 post1 추가
            const finalVersion = `${VERSION_PREFIX}${lastVersion}.post1`;
            console.log(`🔺 첫 번째 Post-release 버전: ${lastVersion} -> ${lastVersion}.post1`);
            return finalVersion;
        }
    }

    // 버전 파싱 (이미 getLastVersion에서 prefix 제거됨)
    let versionToParse = lastVersion;

    // post-release 버전인 경우 base 버전만 사용
    const postMatch = lastVersion.match(/^(.+)\.post\d+$/);
    if (postMatch) {
        versionToParse = postMatch[1];
        console.log(`🔍 Post-release 버전에서 base 버전 추출: ${lastVersion} -> ${versionToParse}`);
    }

    const versionParts = versionToParse.split('.');

    // 정확히 4개의 파트가 있어야 함
    while (versionParts.length < 4) {
        versionParts.push('0');
    }

    // 각 파트 파싱
    let lastYear = parseInt(versionParts[0], 10) || 2024;
    let lastMonth = parseInt(versionParts[1], 10) || 1;
    let lastMinor = parseInt(versionParts[2], 10) || 0;
    let lastFixNumber = parseInt(versionParts[3], 10) || 0;

    console.log(`🔍 현재 날짜: ${currentYear}.${currentMonth}, 릴리즈 타입: ${releaseType}`);

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
        finalVersion = `${VERSION_PREFIX}${newYear}.${newMonth.toString().padStart(2, '0')}.${newMinor}.${newFixNumber}`;
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

    // Release notes 생성 (lastTag 정보 재사용)
    const lastVersionInfo = getLastVersion();
    const releaseNotes = generateReleaseNotes(prInfos, calendarVersion, lastVersionInfo.tag);
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
    console.log(`📄 Release notes: ${releaseNotes}`);

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