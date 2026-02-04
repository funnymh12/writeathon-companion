
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');

// Ensure release directory exists
if (!fs.existsSync(RELEASE_DIR)) {
    fs.mkdirSync(RELEASE_DIR);
}

// Read package.json
const packageJson = require(path.join(ROOT_DIR, 'package.json'));
const version = packageJson.version;

// Read manifest.json (source)
const manifestPath = path.join(ROOT_DIR, 'public', 'manifest.json');
const manifest = require(manifestPath);

console.log(`📦 Packaging Writeathon Companion v${version}...`);

// 1. Sync Version
if (manifest.version !== version) {
    console.log(`🔄 Updating manifest version from ${manifest.version} to ${version}...`);
    manifest.version = version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
}

// 2. Build
console.log('🏗️  Building project...');
try {
    execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (error) {
    console.error('❌ Build failed.');
    process.exit(1);
}

// 3. Zip
const zipName = `writeathon-companion-v${version}.zip`;
const zipPath = path.join(RELEASE_DIR, zipName);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function () {
    console.log(`✅ Package created: ${zipPath} (${archive.pointer()} bytes)`);
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);

// Append files from dist directory
archive.directory(DIST_DIR, false);

archive.finalize();
