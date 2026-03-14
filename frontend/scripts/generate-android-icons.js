/**
 * Generates Android launcher icons from the source assets in assets/images/.
 * Run once from the frontend directory: node scripts/generate-android-icons.js
 *
 * Uses @expo/prebuild-config (already a dependency) to avoid a full expo prebuild
 * which would overwrite customised native files (AndroidManifest, etc.)
 */

const path = require('path');
const fs = require('fs');
const {
  setIconAsync,
  configureAdaptiveIconAsync,
} = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');

const projectRoot = path.resolve(__dirname, '..');
const iconPath = './assets/images/icon.png';
const adaptiveIconPath = './assets/images/adaptive-icon.png';
const backgroundColor = '#0A0A0A';

async function main() {
  console.log('Generating Android launcher icons...');

  // 1. Legacy icons: ic_launcher.webp + ic_launcher_round.webp at all densities
  await setIconAsync(projectRoot, {
    icon: iconPath,
    backgroundColor,
    backgroundImage: null,
    monochromeImage: null,
    isAdaptive: false,
  });
  console.log('  ✓ Legacy icons generated');

  // 2. Adaptive icons: ic_launcher_foreground.webp at all densities + mipmap-anydpi-v26/ XMLs
  await configureAdaptiveIconAsync(projectRoot, adaptiveIconPath, null, null, true);
  console.log('  ✓ Adaptive icons generated (mipmap-anydpi-v26/)');

  // 3. Copy ic_launcher.webp → ic_launcher_round.webp for pre-API 26 legacy fallback
  const densities = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
  const resPath = path.join(projectRoot, 'android/app/src/main/res');
  for (const density of densities) {
    const src = path.join(resPath, density, 'ic_launcher.webp');
    const dst = path.join(resPath, density, 'ic_launcher_round.webp');
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  }
  console.log('  ✓ Round icon fallbacks created');

  // 4. Fix ic_launcher_background.xml — was pointing to splashscreen_logo
  const bgXmlPath = path.join(
    projectRoot,
    'android/app/src/main/res/drawable/ic_launcher_background.xml'
  );
  fs.writeFileSync(
    bgXmlPath,
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n    <solid android:color="#0A0A0A"/>\n</shape>\n`
  );
  console.log('  ✓ ic_launcher_background.xml fixed');

  console.log('\nDone. Rebuild the Android app to pick up the new icons.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
