#!/usr/bin/env node
/**
 * favicon.svg → macOS .icns 아이콘 생성 스크립트
 *
 * 사용법: node scripts/generate-icons.js
 * 필요: sharp (devDependency)
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const SVG_SOURCE = path.join(__dirname, '..', '..', 'frontend', 'public', 'favicon.svg');
const ICONS_DIR = path.join(__dirname, '..', 'icons');
const ICONSET_DIR = path.join(ICONS_DIR, 'app.iconset');

// macOS .iconset 에 필요한 크기들
const SIZES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

async function main() {
  console.log('=== macOS 아이콘 생성 ===');
  console.log(`SVG 소스: ${SVG_SOURCE}`);

  if (!fs.existsSync(SVG_SOURCE)) {
    console.error(`ERROR: SVG 파일을 찾을 수 없습니다: ${SVG_SOURCE}`);
    process.exit(1);
  }

  // 디렉토리 생성
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  const svgBuffer = fs.readFileSync(SVG_SOURCE);

  // 각 크기의 PNG 생성
  for (const { name, size } of SIZES) {
    const outputPath = path.join(ICONSET_DIR, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`  생성: ${name} (${size}x${size})`);
  }

  // electron-builder용 1024x1024 PNG도 생성 (fallback)
  const pngPath = path.join(ICONS_DIR, 'icon.png');
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(pngPath);
  console.log(`  생성: icon.png (1024x1024)`);

  // macOS iconutil로 .icns 생성
  const icnsPath = path.join(ICONS_DIR, 'icon.icns');
  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${icnsPath}"`);
    console.log(`  생성: icon.icns`);

    // .iconset 디렉토리 정리
    fs.rmSync(ICONSET_DIR, { recursive: true });
    console.log('  iconset 임시 디렉토리 정리 완료');
  } catch (err) {
    console.warn(`  경고: iconutil 실행 실패 (macOS가 아닌 환경). icon.png를 대신 사용합니다.`);
    console.warn(`  ${err.message}`);
  }

  console.log('\n아이콘 생성 완료!');
}

main().catch((err) => {
  console.error('아이콘 생성 실패:', err);
  process.exit(1);
});
