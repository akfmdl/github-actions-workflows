#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';

function getLastVersion() {
    try {
        const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
        return lastTag.replace(/^v/, ''); // Remove 'v' prefix if exists
    } catch (error) {
        return '2024.01.0.0'; // Default version if no tags exist
    }
}

function generateVersion(releaseType) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 0-based month

    const lastVersion = getLastVersion();
    const [lastYear, lastMonth, lastMinor, lastFix] = lastVersion.split('.').map(n => parseInt(n, 10));

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
        }
    }

    const newVersion = `${newYear}.${newMonth.toString().padStart(2, '0')}.${newMinor}.${newFix}`;

    console.log(`Previous version: ${lastVersion}`);
    console.log(`Release type: ${releaseType}`);
    console.log(`Generated version: ${newVersion}`);

    return newVersion;
}

// Get release type from command line argument or environment
const releaseType = process.argv[2] || process.env.RELEASE_TYPE || 'patch';
const version = generateVersion(releaseType);

// Update version.py file
if (fs.existsSync('version.py')) {
    const content = fs.readFileSync('version.py', 'utf8');
    const updatedContent = content.replace(/__VERSION__ = ".*"/, `__VERSION__ = "${version}"`);
    fs.writeFileSync('version.py', updatedContent);
    console.log(`Updated version.py with version: ${version}`);
}

// Output the version for semantic-release
console.log(version);