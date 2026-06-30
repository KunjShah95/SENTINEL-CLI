#!/usr/bin/env node

/**
 * Build script for Sentinel
 * This script prepares the application for production deployment
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BuildTool {
  constructor() {
    this.srcDir = path.join(__dirname, '..');
    this.distDir = path.join(__dirname, '..', '..', 'dist');
  }

  async build() {
    console.log('🔨 Building Sentinel...');

    try {
      // Create dist directory
      await this.createDistDirectory();

      // Copy source files
      await this.copySourceFiles();

      // Create entry point
      await this.createEntryPoint();

      // Create package.json for distribution
      await this.createDistPackageJson();

      console.log('✅ Build completed successfully!');
      console.log(`📦 Output directory: ${this.distDir}`);
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      throw error;
    }
  }

  async createDistDirectory() {
    await fs.mkdir(this.distDir, { recursive: true });
    console.log('📁 Created dist directory');
  }

  async copySourceFiles() {
    // Copy all subdirectories from src/ to dist/ except tui and dist
    try {
      const items = await fs.readdir(this.srcDir);
      for (const item of items) {
        if (item === 'dist' || item === 'tui' || item === 'index.js') continue;
        const srcPath = path.resolve(this.srcDir, item);
        const destPath = path.resolve(this.distDir, item);
        const stats = await fs.stat(srcPath);
        if (stats.isDirectory()) {
          await this.copyDirectory(srcPath, destPath);
          console.log(`📋 Copied directory ${item}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not copy subdirectories: ${error.message}`);
    }

    const filesToTransform = [
      {
        src: path.join(this.srcDir, 'dist', 'cli.js'),
        dest: path.join(this.distDir, 'cli.js'),
        transform: (content) => {
          // Replace static imports: from '../...' to from './...'
          let transformed = content.replace(/from\s+['"]\.\.\/([^'"]+)['"]/g, 'from \'./$1\'');
          // Replace dynamic imports: import('../...') to import('./...')
          transformed = transformed.replace(/import\s*\(\s*['"]\.\.\/([^'"]+)['"]\s*\)/g, 'import(\'./$1\')');
          return transformed;
        }
      },
      {
        src: path.join(this.srcDir, 'core', 'bot.js'),
        dest: path.join(this.distDir, 'bot.js'),
        transform: (content) => {
          // First, replace ./ with ./core/ for local imports
          let transformed = content.replace(/from\s+['"]\.\/([^'"]+)['"]/g, 'from \'./core/$1\'');
          // Next, replace ../ with ./
          transformed = transformed.replace(/from\s+['"]\.\.\/([^'"]+)['"]/g, 'from \'./$1\'');
          return transformed;
        }
      },
      {
        src: path.join(this.srcDir, 'core', 'demo.js'),
        dest: path.join(this.distDir, 'demo.js'),
        transform: (content) => content
      },
    ];

    for (const file of filesToTransform) {
      try {
        let content = await fs.readFile(file.src, 'utf8');
        content = file.transform(content);
        await fs.writeFile(file.dest, content, 'utf8');
        console.log(`📋 Copied and transformed ${path.basename(file.dest)}`);
      } catch (error) {
        console.warn(`⚠️  Could not copy/transform ${path.basename(file.dest)}: ${error.message}`);
      }
    }
  }



  async copyDirectory(srcDir, destDir) {
    await fs.mkdir(destDir, { recursive: true });

    let items;
    try {
      items = await fs.readdir(srcDir);
    } catch (error) {
      console.warn(`⚠️  Cannot read directory ${srcDir}: ${error.message}`);
      return;
    }

    for (const item of items) {
      // Validate item name to prevent path traversal
      if (item.includes('..') || item.includes('/') || item.includes('\\')) {
        console.warn(`⚠️  Skipping potentially unsafe item: ${item}`);
        continue;
      }

      const srcPath = path.resolve(srcDir, item);
      const destPath = path.resolve(destDir, item);

      // Validate paths are within expected directories
      if (!srcPath.startsWith(path.resolve(srcDir)) ||
        !destPath.startsWith(path.resolve(destDir))) {
        console.warn(`⚠️  Skipping unsafe path: ${item}`);
        continue;
      }

      try {
        const stats = await fs.stat(srcPath);

        if (stats.isDirectory()) {
          await this.copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      } catch (error) {
        console.warn(`⚠️  Could not copy ${item}: ${error.message}`);
      }
    }
  }

  async createEntryPoint() {
    const entryPointContent = `#!/usr/bin/env node

import './cli.js';
`;

    await fs.writeFile(path.join(this.distDir, 'index.js'), entryPointContent);
    console.log('📝 Created entry point');
  }

  async createDistPackageJson() {
    let originalPackageJson;
    try {
      const packageJsonContent = await fs.readFile(path.join(__dirname, '..', '..', 'package.json'), 'utf8');
      originalPackageJson = JSON.parse(packageJsonContent);
    } catch (error) {
      throw new Error(`Failed to read package.json: ${error.message}`);
    }

    const distPackageJson = {
      name: originalPackageJson.name,
      version: originalPackageJson.version,
      description: originalPackageJson.description,
      main: 'index.js',
      type: 'module',
      scripts: {
        start: 'node index.js',
        demo: 'node demo.js',
      },
      keywords: originalPackageJson.keywords,
      author: originalPackageJson.author,
      license: originalPackageJson.license,
      dependencies: originalPackageJson.dependencies,
    };

    await fs.writeFile(
      path.join(this.distDir, 'package.json'),
      JSON.stringify(distPackageJson, null, 2)
    );

    console.log('📦 Created dist package.json');
  }
}

// Run build if called directly
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const buildTool = new BuildTool();
  buildTool.build().catch((error) => {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  });
}

export default BuildTool;
