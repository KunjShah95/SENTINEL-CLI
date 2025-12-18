const fs = require('fs');
const path = require('path');

const directory = 'c:/PR REVIEW BOT/frontend/src/components/ui';

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            processDirectory(filePath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            let content = fs.readFileSync(filePath, 'utf8');
            const newContent = content.replace(/from "(.*)@\d+\.\d+\.\d+"/g, 'from "$1"');
            if (content !== newContent) {
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log(`Fixed imports in ${filePath}`);
            }
        }
    });
}

processDirectory(directory);
