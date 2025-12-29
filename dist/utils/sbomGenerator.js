import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { exec as _exec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(_exec);

/**
 * Software Bill of Materials (SBOM) Generator for Sentinel
 * Supports CycloneDX and SPDX formats with license compliance
 */
export class SBOMGenerator {
    constructor(sbomDir = '.sentinel') {
        this.sbomDir = sbomDir;
        this.components = new Map();
        this.dependencies = new Map();
        this.licenses = new Map();
        this.vulnerabilities = new Map();
    }

    /**
     * Initialize SBOM generator
     */
    async initialize() {
        try {
            await fs.mkdir(this.sbomDir, { recursive: true });
            console.log('✅ SBOM Generator initialized');
        } catch (error) {
            console.warn('⚠️ SBOM generator initialization failed:', error.message);
        }
    }

    /**
     * Generate SBOM from project analysis
     */
    async generateSBOM(options = {}) {
        const {
            format = 'cyclonedx',
            outputPath = null,
            includeVulnerabilities = true,
            includeLicenses = true,
            depth = 'all',
            excludeDev = false,
        } = options;

        console.log('🔍 Analyzing project for SBOM generation...');

        // Scan project structure
        const projectInfo = await this.analyzeProjectStructure();

        // Parse package files
        const packageInfo = await this.parsePackageFiles();

        // Scan dependencies
        const dependencies = await this.scanDependencies(packageInfo, {
            includeDev: !excludeDev,
            depth,
        });

        // Detect licenses
        const licenses = includeLicenses ? await this.detectLicenses(dependencies) : [];

        // Check for vulnerabilities
        const vulnerabilities = includeVulnerabilities ? await this.checkVulnerabilities(dependencies) : [];

        // Build SBOM data
        const sbomData = this.buildSBOMData({
            projectInfo,
            components: Array.from(this.components.values()),
            dependencies,
            licenses,
            vulnerabilities,
            metadata: {
                generatedAt: new Date().toISOString(),
                generator: 'Sentinel CLI v1.5.0',
                format,
            },
        });

        // Generate output
        const result = await this.generateOutput(sbomData, format, outputPath);

        console.log(`✅ SBOM generated: ${result.outputPath}`);
        return result;
    }

    /**
     * Analyze project structure
     */
    async analyzeProjectStructure() {
        const projectInfo = {
            name: await this.getProjectName(),
            version: await this.getProjectVersion(),
            type: await this.detectProjectType(),
            description: '',
            authors: [],
            copyright: '',
            licenses: [],
            buildSystem: this.detectBuildSystem(),
            componentCount: 0,
            dependencyCount: 0,
        };

        // Try to read package.json for additional info
        try {
            const packageJson = await fs.readFile('package.json', 'utf8');
            const pkg = JSON.parse(packageJson);

            projectInfo.name = projectInfo.name || pkg.name || 'unknown';
            projectInfo.version = projectInfo.version || pkg.version || '0.0.0';
            projectInfo.description = pkg.description || '';
            projectInfo.authors = this.extractAuthors(pkg);
            projectInfo.copyright = this.extractCopyright(pkg);
            projectInfo.licenses = this.extractLicenses(pkg);
        } catch (error) {
            // package.json not found or invalid
        }

        return projectInfo;
    }

    /**
     * Get project name
     */
    async getProjectName() {
        try {
            const content = await fs.readFile('package.json', 'utf8');
            const packageJson = JSON.parse(content);
            return packageJson.name || path.basename(process.cwd());
        } catch {
            // Fallback to directory name
            const cwd = process.cwd();
            return path.basename(cwd);
        }
    }

    /**
     * Get project version
     */
    async getProjectVersion() {
        try {
            const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
            return packageJson.version;
        } catch {
            try {
                // Try git describe
                const { stdout } = await exec('git describe --tags --always --dirty');
                return stdout.trim();
            } catch {
                return '1.0.0';
            }
        }
    }

    /**
     * Detect project type
     */
    async detectProjectType() {
        try {
            const files = await fs.readdir(process.cwd());

            if (files.includes('package.json')) {
                return 'npm';
            }
            if (files.includes('requirements.txt') || files.includes('setup.py')) {
                return 'python';
            }
            if (files.includes('pom.xml')) {
                return 'maven';
            }
            if (files.includes('Cargo.toml')) {
                return 'cargo';
            }
            if (files.includes('go.mod')) {
                return 'go';
            }
        } catch (error) {
            // ignore
        }

        return 'unknown';
    }

    /**
     * Detect build system
     */
    detectBuildSystem() {
        return {
            type: 'npm',
            version: process.version || 'unknown',
        };
    }

    /**
     * Extract authors from package.json
     */
    extractAuthors(pkg) {
        const authors = [];

        if (pkg.author) {
            authors.push(typeof pkg.author === 'string' ? pkg.author : pkg.author.name || 'unknown');
        }

        if (pkg.contributors) {
            for (const contributor of pkg.contributors) {
                if (typeof contributor === 'string') {
                    authors.push(contributor);
                } else if (contributor.name) {
                    authors.push(contributor.name);
                }
            }
        }

        return [...new Set(authors)];
    }

    /**
     * Extract copyright from package.json
     */
    extractCopyright(pkg) {
        if (pkg.license && typeof pkg.license === 'object' && pkg.license.copyright) {
            return pkg.license.copyright;
        }
        return '';
    }

    /**
     * Extract licenses from package.json
     */
    extractLicenses(pkg) {
        const licenses = [];

        if (pkg.license) {
            if (typeof pkg.license === 'string') {
                licenses.push(pkg.license);
            } else if (Array.isArray(pkg.license)) {
                licenses.push(...pkg.license);
            } else if (typeof pkg.license === 'object') {
                if (pkg.license.type) licenses.push(pkg.license.type);
                if (pkg.license.name) licenses.push(pkg.license.name);
            }
        }

        return [...new Set(licenses)];
    }

    /**
     * Parse package files
     */
    async parsePackageFiles() {
        const packageFiles = new Map();

        // Parse package.json
        try {
            const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
            packageFiles.set('package.json', {
                type: 'npm',
                format: 'json',
                dependencies: packageJson.dependencies || {},
                devDependencies: packageJson.devDependencies || {},
                peerDependencies: packageJson.peerDependencies || {},
                optionalDependencies: packageJson.optionalDependencies || {},
            });
        } catch (error) {
            console.warn('Could not parse package.json:', error.message);
        }

        // Parse requirements.txt for Python
        try {
            await fs.access('requirements.txt');
            const requirements = await fs.readFile('requirements.txt', 'utf8');
            packageFiles.set('requirements.txt', {
                type: 'python',
                format: 'pip',
                dependencies: this.parseRequirementsTxt(requirements),
            });
        } catch (error) {
            // file not present or unreadable
        }

        // Parse Pipfile.lock
        try {
            await fs.access('Pipfile.lock');
            const pipfile = await fs.readFile('Pipfile.lock', 'utf8');
            packageFiles.set('Pipfile.lock', {
                type: 'python',
                format: 'pip',
                dependencies: this.parsePipfileLock(pipfile),
            });
        } catch (error) {
            // file not present or unreadable
        }

        // Parse Cargo.lock for Rust
        try {
            await fs.access('Cargo.lock');
            const cargoLock = await fs.readFile('Cargo.lock', 'utf8');
            packageFiles.set('Cargo.lock', {
                type: 'cargo',
                format: 'toml',
                dependencies: this.parseCargoLock(cargoLock),
            });
        } catch (error) {
            // file not present or unreadable
        }

        // Parse go.mod for Go
        try {
            await fs.access('go.mod');
            const goMod = await fs.readFile('go.mod', 'utf8');
            packageFiles.set('go.mod', {
                type: 'go',
                format: 'go',
                dependencies: this.parseGoMod(goMod),
            });
        } catch (error) {
            // file not present or unreadable
        }

        return packageFiles;
    }

    /**
     * Parse requirements.txt
     */
    parseRequirementsTxt(content) {
        const dependencies = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                // support formats like package==1.2.3, package>=1.0, or just package
                const match = trimmed.match(/^([a-zA-Z0-9._-]+)(?:\s*(?:==|>=|<=|>|<)\s*([0-9a-zA-Z.\-+~]+))?/);
                if (match) {
                    dependencies[match[1]] = match[2] || '';
                }
            }
        }

        return dependencies;
    }

    /**
     * Parse Pipfile.lock
     */
    parsePipfileLock(content) {
        // Simple TOML-like parsing for dependencies
        const dependencies = {};
        const lines = content.split('\n');

        let inPackage = false;
        let currentPackage = null;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === '[[package]]') {
                if (currentPackage && currentPackage.name) {
                    dependencies[currentPackage.name] = currentPackage.version || '';
                }
                currentPackage = {};
                inPackage = true;
                continue;
            }

            if (inPackage) {
                if (trimmed.startsWith('name = ')) {
                    currentPackage.name = trimmed.split('=')[1].trim().replace(/^"|"$/g, '');
                } else if (trimmed.startsWith('version = ')) {
                    currentPackage.version = trimmed.split('=')[1].trim().replace(/^"|"$/g, '');
                }
            }
        }

        if (currentPackage && currentPackage.name) {
            dependencies[currentPackage.name] = currentPackage.version || '';
        }

        return dependencies;
    }

    /**
     * Parse Cargo.lock
     */
    parseCargoLock(content) {
        const dependencies = {};
        const lines = content.split('\n');

        let currentPackage = null;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === '[[package]]') {
                if (currentPackage && currentPackage.name) {
                    dependencies[currentPackage.name] = currentPackage.version || '';
                }
                currentPackage = {};
                continue;
            }

            if (trimmed.startsWith('name = ')) {
                currentPackage.name = trimmed.split('=')[1].trim().replace(/^"|"$/g, '');
            } else if (trimmed.startsWith('version = ')) {
                if (currentPackage) {
                    currentPackage.version = trimmed.split('=')[1].trim().replace(/^"|"$/g, '');
                }
            }
        }

        if (currentPackage && currentPackage.name) {
            dependencies[currentPackage.name] = currentPackage.version || '';
        }

        return dependencies;
    }

    /**
     * Parse go.mod
     */
    parseGoMod(content) {
        const dependencies = {};
        const lines = content.split('\n');
        let inRequireBlock = false;

        for (let line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('require (')) {
                inRequireBlock = true;
                continue;
            }

            if (inRequireBlock && trimmed === ')') {
                inRequireBlock = false;
                continue;
            }

            if (inRequireBlock || trimmed.startsWith('require ')) {
                // remove leading 'require' if present
                line = trimmed.replace(/^require\s+/, '');
                const match = line.match(/([a-zA-Z0-9._\-/]+)\s+v?([0-9a-zA-Z.\-+~]+)/);
                if (match) {
                    dependencies[match[1]] = match[2];
                }
            }
        }

        return dependencies;
    }

    /**
     * Scan dependencies recursively
     */
    async scanDependencies(packageInfo, options = {}) {
        const {
            includeDev = false,
            depth = 'all',
        } = options;

        const allDependencies = new Map();
        const scannedFiles = new Set();

        for (const [filename, info] of packageInfo) {
            const dependencies = {
                ...info.dependencies,
                ...(includeDev ? info.devDependencies : {}),
            };

            for (const [name, version] of Object.entries(dependencies)) {
                const depKey = `${info.type}:${name}`;

                if (!allDependencies.has(depKey)) {
                    allDependencies.set(depKey, {
                        name,
                        version,
                        type: info.type,
                        source: filename,
                        depth: 0,
                    });
                }
            }

            scannedFiles.add(filename);
        }

        // Resolve transitive dependencies based on depth (convert 'all' to a reasonable limit)
        let maxDepth = depth === 'all' ? 5 : Number(depth);
        if (isNaN(maxDepth)) maxDepth = 0;

        if (maxDepth > 0) {
            await this.resolveTransitiveDependencies(allDependencies, maxDepth, scannedFiles);
        }

        return Array.from(allDependencies.values());
    }

    /**
     * Resolve transitive dependencies
     */
    async resolveTransitiveDependencies(dependencies, maxDepth, scannedFiles = new Set()) {
        let currentDepth = 1;

        while (currentDepth <= maxDepth) {
            const newDependencies = new Map();

            for (const [key, dep] of dependencies) {
                // Skip if already resolved/scanned
                if (scannedFiles.has(key)) continue;

                if (dep.depth < currentDepth) {
                    // Try to resolve this dependency
                    const resolved = await this.resolveDependency(dep);

                    if (resolved) {
                        const resolvedKey = `${resolved.type}:${resolved.name}`;

                        if (!dependencies.has(resolvedKey) && !newDependencies.has(resolvedKey)) {
                            newDependencies.set(resolvedKey, {
                                ...resolved,
                                depth: currentDepth,
                                resolvedFrom: key,
                            });
                        }
                    }
                }
            }

            // Add new dependencies to the main map
            for (const [key, dep] of newDependencies) {
                dependencies.set(key, dep);
            }

            currentDepth++;
        }
    }

    /**
     * Resolve individual dependency
     */
    async resolveDependency(dependency) {
        try {
            switch (dependency.type) {
                case 'npm':
                    return await this.resolveNpmDependency(dependency);
                case 'python':
                    return await this.resolvePythonDependency(dependency);
                case 'cargo':
                    return await this.resolveCargoDependency(dependency);
                case 'go':
                    return await this.resolveGoDependency(dependency);
                default:
                    return null;
            }
        } catch (error) {
            console.warn(`Failed to resolve dependency ${dependency.name}:`, error.message);
            return null;
        }
    }

    /**
     * Validate URL for SSRF protection
     */
    validateUrl(url) {
        try {
            const parsedUrl = new URL(url);

            // Block private IP ranges and localhost
            const hostname = parsedUrl.hostname;
            if (
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.startsWith('172.') ||
                hostname === '169.254.169.254' // AWS metadata service
            ) {
                throw new Error('Access to private IP ranges is not allowed');
            }

            // Only allow HTTP/HTTPS
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('Only HTTP/HTTPS protocols are allowed');
            }

            return true;
        } catch (error) {
            throw new Error(`Invalid URL: ${error.message}`);
        }
    }

    /**
     * Resolve npm dependency
     */
    async resolveNpmDependency(dependency) {
        try {
            // Validate dependency name to prevent command injection
            if (!/^[a-zA-Z0-9._@/-]+$/.test(dependency.name)) {
                throw new Error('Invalid dependency name');
            }

            const { stdout } = await exec(`npm view ${dependency.name} --json`, { timeout: 10000 });
            let info = null;
            try {
                info = JSON.parse(stdout);
            } catch (e) {
                // sometimes npm returns plain version string
                info = { version: stdout.trim() };
            }

            return {
                name: dependency.name,
                version: info.version,
                description: info.description || '',
                license: info.license || '',
                homepage: info.homepage || '',
                repository: info.repository?.url || '',
                type: 'npm',
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Resolve Python dependency
     */
    async resolvePythonDependency(dependency) {
        try {
            // Validate dependency name to prevent command injection
            if (!/^[a-zA-Z0-9._-]+$/.test(dependency.name)) {
                throw new Error('Invalid dependency name');
            }

            const { stdout } = await exec(`pip show ${dependency.name}`, { timeout: 10000 });
            const lines = stdout.split('\n');

            const info = {
                name: dependency.name,
                version: '',
                description: '',
                license: '',
                type: 'python',
            };

            for (const line of lines) {
                if (line.startsWith('Version:')) {
                    info.version = line.split(':')[1].trim();
                } else if (line.startsWith('Summary:')) {
                    info.description = line.split(':')[1].trim();
                } else if (line.startsWith('License:')) {
                    info.license = line.split(':')[1].trim();
                }
            }

            return info;
        } catch (error) {
            return null;
        }
    }

    /**
     * Resolve Cargo dependency
     */
    async resolveCargoDependency(dependency) {
        try {
            // Validate dependency name to prevent command injection
            if (!/^[a-zA-Z0-9._-]+$/.test(dependency.name)) {
                throw new Error('Invalid dependency name');
            }

            const { stdout } = await exec(`cargo search ${dependency.name} --limit 1`, { timeout: 10000 });
            const lines = stdout.split('\n');

            const info = {
                name: dependency.name,
                version: '',
                description: '',
                license: '',
                type: 'cargo',
            };

            for (const line of lines) {
                if (line.includes(dependency.name)) {
                    const match = line.match(/"([^"]+)"\s*=\s*"([^"]+)"/);
                    if (match) {
                        info.version = match[2];
                    }
                }
            }

            return info;
        } catch (error) {
            return null;
        }
    }

    /**
     * Resolve Go dependency
     */
    async resolveGoDependency(dependency) {
        try {
            // Validate dependency name to prevent command injection
            if (!/^[a-zA-Z0-9._/-]+$/.test(dependency.name)) {
                throw new Error('Invalid dependency name');
            }

            const { stdout } = await exec(`go list -m -json ${dependency.name}`, { timeout: 10000 });
            const info = JSON.parse(stdout);

            return {
                name: dependency.name,
                version: info.Version || dependency.version,
                description: info.Module && info.Module.Path ? info.Module.Path : (info.Path || ''),
                type: 'go',
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Detect licenses
     */
    async detectLicenses(dependencies) {
        const licenses = new Map();

        for (const dep of dependencies) {
            if (dep.license) {
                licenses.set(dep.name, {
                    id: this.generateLicenseId(),
                    name: dep.license,
                    type: 'declared',
                    source: 'package',
                });
            } else {
                // Try to detect license from source
                const detectedLicense = await this.detectLicenseFromSource(dep);
                if (detectedLicense) {
                    licenses.set(dep.name, detectedLicense);
                }
            }
        }

        return Array.from(licenses.values());
    }

    /**
     * Detect license from source
     */
    async detectLicenseFromSource(_dependency) {
        // This is a simplified implementation
        // In a real scenario, this would scan the source code for license headers
        const commonLicenses = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'ISC'];

        // Try to read LICENSE file
        try {
            const licenseFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING'];

            for (const licenseFile of licenseFiles) {
                try {
                    await fs.access(licenseFile);
                    const content = await fs.readFile(licenseFile, 'utf8');
                    const firstLine = content.split('\n')[0].toLowerCase();

                    for (const license of commonLicenses) {
                        if (firstLine.includes(license.toLowerCase())) {
                            return {
                                id: this.generateLicenseId(),
                                name: license,
                                type: 'detected',
                                source: 'file',
                            };
                        }
                    }
                } catch (err) {
                    // file not present, continue
                }
            }
        } catch (error) {
            // Ignore file reading errors
        }

        return null;
    }

    /**
     * Check vulnerabilities
     */
    async checkVulnerabilities(dependencies) {
        const vulnerabilities = [];

        for (const dep of dependencies) {
            try {
                // Check against known vulnerability databases
                const vulns = await this.checkDependencyVulnerabilities(dep);

                for (const vuln of vulns) {
                    vulnerabilities.push({
                        id: this.generateVulnerabilityId(),
                        component: {
                            name: dep.name,
                            version: dep.version,
                            type: dep.type,
                        },
                        vulnerability: vuln,
                    });
                }
            } catch (error) {
                console.warn(`Failed to check vulnerabilities for ${dep.name}:`, error.message);
            }
        }

        return vulnerabilities;
    }

    /**
     * Check specific dependency vulnerabilities
     */
    async checkDependencyVulnerabilities(dependency) {
        // This would integrate with CVE databases
        // For now, return mock data
        const mockVulnerabilities = {
            'lodash': [
                { id: 'CVE-2019-10744', severity: 'high', description: 'Prototype pollution' },
                { id: 'CVE-2021-23337', severity: 'medium', description: 'Regular expression denial of service' },
            ],
            'express': [
                { id: 'CVE-2022-24999', severity: 'medium', description: 'Path traversal vulnerability' },
            ],
        };

        return mockVulnerabilities[dependency.name] || [];
    }

    /**
     * Build SBOM data structure
     */
    buildSBOMData(data) {
        const { projectInfo, components, dependencies, vulnerabilities, metadata } = data;

        const bomFormat = {
            bomFormat: 'CycloneDX',
            specVersion: '1.4',
            serialNumber: this.generateSerialNumber(),
            version: 1,
            metadata: {
                timestamp: metadata.generatedAt,
                tools: [
                    {
                        vendor: 'Sentinel CLI',
                        name: 'Sentinel CLI',
                        version: '1.3.0',
                    },
                ],
                component: {
                    type: projectInfo.type,
                    name: projectInfo.name,
                    version: projectInfo.version,
                    description: projectInfo.description,
                    authors: projectInfo.authors,
                    copyright: projectInfo.copyright,
                    licenses: projectInfo.licenses.map(lic => ({ license: lic })),
                    components: components.map(comp => ({
                        type: 'library',
                        name: comp.name,
                        version: comp.version,
                        description: comp.description || '',
                        licenses: comp.licenses || [],
                        externalReferences: comp.externalReferences || [],
                    })),
                },
            },
            dependencies: dependencies.map(dep => ({
                ref: this.generateDependencyRef(dep),
                dependencies: [], // Would be filled with transitive dependencies
            })),
            vulnerabilities: vulnerabilities.map(vuln => ({
                ref: this.generateVulnerabilityRef(vuln),
                id: vuln.vulnerability.id,
                source: {
                    name: vuln.vulnerability.source || 'NVD',
                    url: vuln.vulnerability.url || '',
                },
                ratings: [
                    {
                        score: vuln.vulnerability.cvssScore || 5.0,
                        severity: vuln.vulnerability.severity || 'medium',
                        method: vuln.vulnerability.method || 'CVSSv31',
                        vector: vuln.vulnerability.vector || 'NETWORK',
                    },
                ],
                cwes: vuln.vulnerability.cwe || [],
                description: vuln.vulnerability.description,
                advisories: vuln.vulnerability.advisories || [],
            })),
            signatures: [], // Would be populated with actual signatures
        };

        return bomFormat;
    }

    /**
     * Generate serial number
     */
    generateSerialNumber() {
        return Date.now().toString(36);
    }

    /**
     * Generate dependency reference
     */
    generateDependencyRef(dependency) {
        return {
            type: dependency.type,
            url: dependency.repository || '',
        };
    }

    /**
     * Generate vulnerability reference
     */
    generateVulnerabilityRef(vulnerability) {
        return {
            type: 'vulnerability',
            url: vulnerability.url || '',
        };
    }

    /**
     * Generate license ID
     */
    generateLicenseId() {
        return `license_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Generate vulnerability ID
     */
    generateVulnerabilityId() {
        return `vuln_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Generate output in specified format
     */
    async generateOutput(sbomData, format, outputPath) {
        let content;
        let extension;

        switch (format.toLowerCase()) {
            case 'cyclonedx':
                content = JSON.stringify(sbomData, null, 2);
                extension = '.json';
                break;

            case 'spdx':
                content = this.convertToSPDX(sbomData);
                extension = '.spdx.json';
                break;

            case 'json':
                content = JSON.stringify(sbomData, null, 2);
                extension = '.json';
                break;

            default:
                content = JSON.stringify(sbomData, null, 2);
                extension = '.json';
        }

        const defaultPath = path.join(this.sbomDir, `sbom${extension}`);
        const finalPath = outputPath || defaultPath;

        await fs.writeFile(finalPath, content, 'utf8');

        return {
            success: true,
            outputPath: finalPath,
            format,
            componentCount: sbomData.metadata.component.components.length,
            dependencyCount: sbomData.dependencies.length,
            vulnerabilityCount: sbomData.vulnerabilities.length,
        };
    }

    /**
     * Convert to SPDX format
     */
    convertToSPDX(sbomData) {
        const spdx = {
            spdxVersion: 'SPDX-2.3',
            dataLicense: 'CC0-1.0',
            SPDXID: 'SPDXRef-DOCUMENT',
            creationInfo: {
                created: sbomData.metadata.timestamp,
                creators: [
                    'Tool: Sentinel CLI v1.3.0',
                ],
            },
            name: sbomData.metadata.component.name,
            documentNamespace: `https://spdx.org/spdxdocs/spdx-example/${sbomData.metadata.component.name}`,
            documentDescribes: [sbomData.metadata.component],
            packages: sbomData.metadata.component.components.map(comp => ({
                name: comp.name,
                versionInfo: comp.version,
                downloadLocation: '',
                filesAnalyzed: [],
                licenseDeclared: comp.licenses[0]?.license || 'NOASSERTION',
                licenseConcluded: 'NOASSERTION',
                copyrightText: comp.copyright || 'NOASSERTION',
                summary: comp.description || '',
                description: comp.description || '',
                externalRefs: comp.externalReferences || [],
            })),
            hasFiles: false,
        };

        return JSON.stringify(spdx, null, 2);
    }
}

export default SBOMGenerator;
