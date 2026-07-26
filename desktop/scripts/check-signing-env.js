#!/usr/bin/env node
/**
 * 배포 빌드(build:release) 사전 점검.
 *
 * 서명 인증서와 공증 자격증명이 갖춰졌는지 먼저 확인한다. 갖춰지지 않은 상태로
 * electron-builder를 돌리면 수 분간 패키징한 뒤 마지막 공증 단계에서 실패해,
 * 무엇이 빠졌는지 알아보기 어려운 오류만 남는다.
 *
 * 비밀값은 절대 출력하지 않는다(설정 여부만 표시).
 */
const { execSync } = require('child_process')

const FAIL = []
const OK = []

// ── 1) 코드 서명 인증서 ────────────────────────────────────────────────
// CSC_LINK(.p12)를 쓰면 키체인에 없어도 electron-builder가 가져온다.
if (process.env.CSC_LINK) {
  OK.push('서명: CSC_LINK 로 인증서 주입')
  if (!process.env.CSC_KEY_PASSWORD) {
    FAIL.push('CSC_LINK 는 있는데 CSC_KEY_PASSWORD 가 없습니다 (.p12 암호).')
  }
} else {
  let identities = ''
  try {
    identities = execSync('security find-identity -v -p codesigning', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    identities = ''
  }
  if (/Developer ID Application/.test(identities)) {
    OK.push('서명: 키체인의 Developer ID Application 인증서 사용')
  } else {
    FAIL.push(
      '서명할 인증서가 없습니다.\n' +
        '      키체인에 "Developer ID Application" 인증서를 설치하거나,\n' +
        '      CSC_LINK(.p12 경로 또는 base64) + CSC_KEY_PASSWORD 를 설정하세요.',
    )
  }
}

// ── 2) 공증 자격증명 ──────────────────────────────────────────────────
// 방식 A: Apple ID + 앱 암호, 방식 B: App Store Connect API 키. 하나만 있으면 된다.
const hasAppleId =
  process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
const hasApiKey =
  process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER

if (hasAppleId) {
  OK.push('공증: APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID')
} else if (hasApiKey) {
  OK.push('공증: App Store Connect API 키(APPLE_API_KEY 등)')
} else {
  FAIL.push(
    '공증 자격증명이 없습니다. 다음 중 한 묶음을 환경변수로 설정하세요.\n' +
      '      (A) APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID\n' +
      '          앱 암호는 appleid.apple.com > 로그인 및 보안 > 앱 암호에서 발급합니다.\n' +
      '      (B) APPLE_API_KEY(.p8 경로), APPLE_API_KEY_ID, APPLE_API_ISSUER\n' +
      '          App Store Connect > 사용자 및 액세스 > 통합에서 발급합니다.',
  )
}

// ── 결과 ──────────────────────────────────────────────────────────────
for (const line of OK) console.log(`  ✓ ${line}`)

if (FAIL.length > 0) {
  console.error('\n배포 빌드를 시작할 수 없습니다:\n')
  FAIL.forEach((m, i) => console.error(`  ${i + 1}) ${m}\n`))
  console.error('자격증명 없이 서명/공증을 건너뛰고 빌드하려면: npm run build\n')
  process.exit(1)
}

console.log('\n서명·공증 준비 완료. 패키징을 시작합니다.\n')
