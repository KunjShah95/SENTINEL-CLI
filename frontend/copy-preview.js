const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'public', 'sentinel-preview.png');
const dest = path.join(__dirname, 'build', 'sentinel-preview.png');

console.log('Copying from:', src);
console.log('To:', dest);

try {
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('Success!');
    } else {
        console.error('Source file not found!');
        // Try to find it in the root or build/public
        const altSrc = path.join(__dirname, 'build', 'public', 'sentinel-preview.png');
        if (fs.existsSync(altSrc)) {
            console.log('Found in build/public, copying from there...');
            fs.copyFileSync(altSrc, dest);
            console.log('Success!');
        } else {
            console.error('Source file not found in alternative locations either.');
        }
    }
} catch (err) {
    console.error('Error:', err);
}
