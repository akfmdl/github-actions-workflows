#!/usr/bin/env node

const JIRA_BASE_URL = 'https://your-jira-instance.atlassian.net';

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

// 테스트 케이스들
const testCases = [
    "feat: [ZQZT-502] 단일 티켓 테스트",
    "feat: [ZQZT-502, ZQZT-493] 자동 릴리스 워크플로우의 타겟 브랜치를 'test'로 변경하고, Docker 빌드 및 업데이트 스크립트에서 불필요한 로그 출력을 주석 처리",
    "fix: [ZQZT-100 ZQZT-200] 공백으로 구분된 티켓",
    "chore: [ZQZT-300; ZQZT-400] 세미콜론으로 구분된 티켓",
    "docs: [ZQZT-500,ZQZT-600,ZQZT-700] 여러 티켓 콤마만",
    "test: 티켓이 없는 경우"
];

console.log("=== Jira Links Test ===\n");

testCases.forEach((testCase, index) => {
    console.log(`테스트 ${index + 1}:`);
    console.log(`원본: ${testCase}`);
    console.log(`결과: ${addJiraLinksToText(testCase)}`);
    console.log("");
}); 