const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

/**
 * electron-builder afterPack hook
 *
 * 1. Removes chrome-sandbox binary on Linux to avoid SUID sandbox permission issues
 * 2. Fixes asar node_modules structure: electron-builder may nest hoisted modules
 *    (e.g. call-bind-apply-helpers under call-bind/node_modules/) instead of keeping
 *    them at the top level. This re-hoists any nested modules that are missing from
 *    the top-level node_modules.
 */
exports.default = async function(context) {
  // --- Linux: remove chrome-sandbox ---
  if (context.electronPlatformName === 'linux') {
    const chromeSandboxPath = path.join(context.appOutDir, 'chrome-sandbox');
    if (fs.existsSync(chromeSandboxPath)) {
      console.log('[after-pack] Removing chrome-sandbox to disable SUID sandbox requirement');
      fs.unlinkSync(chromeSandboxPath);
    }
  }

  // --- Fix asar: re-hoist nested node_modules ---
  const resourcesDir = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');

  const asarPath = path.join(resourcesDir, 'app.asar');
  if (!fs.existsSync(asarPath)) {
    return;
  }

  const tempDir = path.join(context.appOutDir, '_asar_fix_temp');
  console.log('[after-pack] Extracting asar to fix node_modules hoisting...');
  asar.extractAll(asarPath, tempDir);

  const topNodeModules = path.join(tempDir, 'node_modules');
  if (!fs.existsSync(topNodeModules)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return;
  }

  let fixCount = 0;

  // Scan all top-level packages for nested node_modules
  const topPackages = fs.readdirSync(topNodeModules);
  for (const pkg of topPackages) {
    const nestedNm = path.join(topNodeModules, pkg, 'node_modules');
    if (!fs.existsSync(nestedNm) || !fs.statSync(nestedNm).isDirectory()) {
      continue;
    }

    const nestedPackages = fs.readdirSync(nestedNm);
    for (const nestedPkg of nestedPackages) {
      // Skip scoped packages starting with . and hidden files
      if (nestedPkg.startsWith('.')) continue;

      const topLevelPath = path.join(topNodeModules, nestedPkg);
      const nestedPath = path.join(nestedNm, nestedPkg);

      // If this module is missing from the top level, hoist it
      if (!fs.existsSync(topLevelPath)) {
        console.log(`[after-pack] Hoisting ${pkg}/node_modules/${nestedPkg} -> node_modules/${nestedPkg}`);
        fs.cpSync(nestedPath, topLevelPath, { recursive: true });
        fixCount++;
      }
    }
  }

  if (fixCount > 0) {
    console.log(`[after-pack] Re-hoisted ${fixCount} module(s). Repacking asar...`);
    // Remove the old asar + unpacked dir
    fs.rmSync(asarPath, { force: true });
    const unpackedDir = asarPath + '.unpacked';
    if (fs.existsSync(unpackedDir)) {
      fs.rmSync(unpackedDir, { recursive: true, force: true });
    }
    await asar.createPackage(tempDir, asarPath);
    console.log('[after-pack] Asar repacked successfully.');
  } else {
    console.log('[after-pack] No hoisting fixes needed.');
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
};
