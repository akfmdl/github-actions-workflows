#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

function getLastVersion() {
    try {
        const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        return lastTag.replace(/^v/, '');
    } catch (error) {
        return '2024.01.0.0';
    }
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
function overrideSemanticVersion() {
    const releaseType = process.env.SEMANTIC_RELEASE_TYPE || 'patch';
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

    return calendarVersion;
}

if (require.main === module) {
    overrideSemanticVersion();
}

module.exports = { generateCalendarVersion, overrideSemanticVersion }; 