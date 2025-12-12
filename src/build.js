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
    this.srcDir = path.join(__dirname);
    this.distDir = path.join(__dirname, '..', 'dist');
  }

  async build() {
    console.log('?? Building Sentinel...');

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
      process.exit(1);
    }
  }

  async createDistDirectory() {
    try {
      await fs.mkdir(this.distDir, { recursive: true });
      console.log('📁 Created dist directory');
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async copySourceFiles() {
    const filesToCopy = [
      'index.js',
      'cli.js',
      'bot.js',
      'demo.js',
      'analyzers',
      'config',
      'git',
      'output',
      'llm',
    ];

    for (const item of filesToCopy) {
      const srcPath = path.join(this.srcDir, item);
      const destPath = path.join(this.distDir, item);

      try {
        const stats = await fs.stat(srcPath);

        if (stats.isDirectory()) {
          await this.copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }

        console.log(`📋 Copied ${item}`);
      } catch (error) {
        console.warn(`⚠️  Could not copy ${item}: ${error.message}`);
      }
    }
  }

  async copyDirectory(srcDir, destDir) {
    await fs.mkdir(destDir, { recursive: true });
    const items = await fs.readdir(srcDir);

    for (const item of items) {
      const srcPath = path.join(srcDir, item);
      const destPath = path.join(destDir, item);
      const stats = await fs.stat(srcPath);

      if (stats.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
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
    const originalPackageJson = JSON.parse(
      await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8')
    );

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
if (import.meta.url === `file://${process.argv[1]}`) {
  const buildTool = new BuildTool();
  buildTool.build().catch(console.error);
}

export default BuildTool;
