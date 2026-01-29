const fs = require('fs');
const path = require('path');

/**
 * electron-builder afterPack hook
 * Removes chrome-sandbox binary to avoid SUID sandbox permission issues on Linux
 * Without this binary, Electron falls back to running without the sandbox
 */
exports.default = async function(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const chromeSandboxPath = path.join(context.appOutDir, 'chrome-sandbox');

  if (fs.existsSync(chromeSandboxPath)) {
    console.log('[after-pack] Removing chrome-sandbox to disable SUID sandbox requirement');
    fs.unlinkSync(chromeSandboxPath);
  }
};
