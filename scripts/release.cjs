
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');
const semver = require('semver');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Helpers
function getFormattedDate() {
    return new Date().toISOString().split('T')[0];
}

function getFormattedDateTime() {
    const now = new Date();
    return now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        // Add time just in case of multiple releases per day, but standard dev log format is usually daily.
        // Let's stick to user request "dev_log_YYYYMMDD.md" if it exists, or create new.
        '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
}

// 1. Bump Version
const packageJsonPath = path.join(ROOT_DIR, 'package.json');
const packageJson = require(packageJsonPath);
const oldVersion = packageJson.version;
const newVersion = semver.inc(oldVersion, 'patch');

console.log(`🚀 Starting release process: v${oldVersion} -> v${newVersion}`);

packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));

const manifestPath = path.join(ROOT_DIR, 'public', 'manifest.json');
const manifest = require(manifestPath);
manifest.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));

console.log('✅ Version bumped in package.json and manifest.json');

// 2. Update Changelog
const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
const changelogEntry = `\n## [${newVersion}] - ${getFormattedDate()}\n- Automated release update.\n`;

if (fs.existsSync(changelogPath)) {
    const currentContent = fs.readFileSync(changelogPath, 'utf8');
    // Insert new entry after the first line (usually # Changelog)
    const lines = currentContent.split('\n');
    let firstHeaderIndex = lines.findIndex(line => line.startsWith('# '));
    if (firstHeaderIndex === -1) firstHeaderIndex = 0;

    // Insert after main header
    lines.splice(firstHeaderIndex + 1, 0, changelogEntry);
    fs.writeFileSync(changelogPath, lines.join('\n'));
} else {
    fs.writeFileSync(changelogPath, `# Changelog\n${changelogEntry}`);
}
console.log('✅ CHANGELOG.md updated');

// 3. Update Dev Log
const today = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
// Try to find an existing log for today or create a new one
const devLogPattern = `dev_log_${today}`;
let devLogFile = fs.readdirSync(DOCS_DIR).find(f => f.startsWith(devLogPattern) && f.endsWith('.md'));

if (!devLogFile) {
    devLogFile = `dev_log_${today}.md`;
    fs.writeFileSync(path.join(DOCS_DIR, devLogFile), `# Dev Log ${today}\n\n`);
}

const devLogPath = path.join(DOCS_DIR, devLogFile);
const devLogEntry = `\n### Release v${newVersion} (${new Date().toLocaleTimeString()})\n- Released version ${newVersion}\n- Check CHANGELOG.md for details.\n`;
fs.appendFileSync(devLogPath, devLogEntry);
console.log(`✅ Development log updated: ${devLogFile}`);


// 4. Build
console.log('🏗️  Building project from release script...');
try {
    execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (error) {
    console.error('❌ Build failed during release script.');
    process.exit(1);
}

// 5. Package
if (!fs.existsSync(RELEASE_DIR)) {
    fs.mkdirSync(RELEASE_DIR);
}

const zipName = `writeathon-companion-v${newVersion}.zip`;
const zipPath = path.join(RELEASE_DIR, zipName);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function () {
    console.log(`✅ Package created: ${zipPath} (${archive.pointer()} bytes)`);
    console.log(`🎉 Release v${newVersion} completed successfully!`);
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);
archive.directory(DIST_DIR, false);
archive.finalize();
