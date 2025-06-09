const { execSync } = require('child_process');

function getLastVersion() {
    try {
        const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        return lastTag.replace(/^v/, ''); // Remove 'v' prefix if exists
    } catch (error) {
        return '2024.01.0.0'; // Default version if no tags exist
    }
}

function generateCalendarVersion(releaseType) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 0-based month

    const lastVersion = getLastVersion();
    const versionParts = lastVersion.split('.');

    // Ensure we have at least 4 parts
    while (versionParts.length < 4) {
        versionParts.push('0');
    }

    const [lastYear, lastMonth, lastMinor, lastFix] = versionParts.map(n => parseInt(n, 10));

    let newYear = currentYear;
    let newMonth = currentMonth;
    let newMinor = 0;
    let newFix = 0;

    // If it's a new year or month, reset minor and fix
    if (currentYear !== lastYear || currentMonth !== lastMonth) {
        newMinor = 0;
        newFix = 0;
    } else {
        // Same year and month, increment based on release type
        if (releaseType === 'minor') {
            newMinor = (lastMinor || 0) + 1;
            newFix = 0;
        } else if (releaseType === 'patch') {
            newMinor = lastMinor || 0;
            newFix = (lastFix || 0) + 1;
        } else {
            // Default to patch for other types
            newMinor = lastMinor || 0;
            newFix = (lastFix || 0) + 1;
        }
    }

    const newVersion = `${newYear}.${newMonth.toString().padStart(2, '0')}.${newMinor}.${newFix}`;
    return newVersion;
}

module.exports = (pluginConfig, context) => {
    return {
        generateNotes: (pluginConfig, context) => {
            const { nextRelease, logger } = context;
            const releaseType = nextRelease.type || 'patch';

            const calendarVersion = generateCalendarVersion(releaseType);

            // Override the version with calendar version
            nextRelease.version = calendarVersion;
            nextRelease.gitTag = `v${calendarVersion}`;

            logger.log(`📅 Generated calendar version: ${calendarVersion} (based on PR label: ${releaseType})`);
            logger.log(`🏷️  Git tag will be: v${calendarVersion}`);

            return `## Calendar Versioning Release

### Version: ${calendarVersion}
- **Release Type**: ${releaseType} (determined by PR labels)
- **Format**: year.month.minor.fix
- **Generated**: ${new Date().toISOString()}

### Changes
${context.nextRelease.notes || 'No specific changes documented.'}`;
        }
    };
}; 