const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running esbuild...');
try {
    execSync('rm -rf dist && npx esbuild src/popup.js src/admin.js src/background.js --bundle --outdir=dist --format=esm', { stdio: 'inherit' });
} catch(e) {
    console.error('esbuild failed');
    process.exit(1);
}

console.log('Copying static assets...');
try {
    execSync('cp *.html *.css google-apps-script.js manifest.json dist/ && cp -r icons dist/', { stdio: 'inherit' });
} catch(e) {
    console.error('copying assets failed');
}

console.log('Stripping Google APIs and reCAPTCHA...');
function stripFile(filename, searchRegex, replaceWith) {
    const filePath = path.join(__dirname, 'dist', filename);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(searchRegex, replaceWith);
        fs.writeFileSync(filePath, content);
    }
}

stripFile('admin.js', /https:\/\/www\.google\.com\/recaptcha\/api\.js/g, 'about:blank');
stripFile('popup.js', /recaptcha\/enterprise\.js/g, 'enterprise_stub.js');
stripFile('background.js', /https:\/\/apis\.google\.com\/js\/api\.js/g, 'about:blank');

console.log('Build complete.');
