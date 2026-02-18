/**
 * Build a Windows MSI installer using electron-wix-msi.
 *
 * Prerequisites:
 *   - Run `npm run pack` first to produce the unpacked Electron app in release/win-unpacked/
 *   - WiX Toolset v3 must be installed: https://wixtoolset.org/docs/wix3/
 *   - Set WIX environment variable or add WiX bin/ to PATH
 *
 * Usage:
 *   node scripts/build-msi.js
 */

const path = require('path');

async function buildMsi() {
  // Lazily require to allow the rest of the project to work without electron-wix-msi installed
  let MSICreator;
  try {
    ({ MSICreator } = require('electron-wix-msi'));
  } catch {
    console.error(
      '[build-msi] electron-wix-msi is not installed.\n' +
      'Install it with: npm install electron-wix-msi --save-dev'
    );
    process.exit(1);
  }

  const APP_DIR = path.join(__dirname, '..', 'release', 'win-unpacked');
  const OUTPUT_DIR = path.join(__dirname, '..', 'release', 'msi');

  const msiCreator = new MSICreator({
    appDirectory: APP_DIR,
    outputDirectory: OUTPUT_DIR,
    description: 'Cross-platform PDF editor with WYSIWYG editing',
    exe: 'PDF Editor',
    name: 'PDF Editor',
    manufacturer: 'PDF Editor Team',
    version: require('../package.json').version,
    appIconPath: path.join(__dirname, '..', 'assets', 'icon.ico'),
    // Stable product upgrade code — do NOT change between releases
    upgradeCode: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ui: {
      chooseDirectory: true,
    },
    features: {
      autoUpdate: false,
      autoLaunch: false,
    },
  });

  try {
    console.log('[build-msi] Creating .wxs file…');
    await msiCreator.create();

    console.log('[build-msi] Compiling MSI…');
    await msiCreator.compile();

    console.log(`[build-msi] MSI created in ${OUTPUT_DIR}`);
  } catch (err) {
    console.error('[build-msi] Failed:', err);
    process.exit(1);
  }
}

buildMsi();
