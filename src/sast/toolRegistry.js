/**
 * SAST Tool Registry
 *
 * Registry of 50+ static analysis tools with install checks,
 * command templates, and output parser references.
 */

// Tool definitions by category
const TOOLS = [
  // ─── JS/TS ───────────────────────────────────────────────────────────
  { name: 'eslint', languages: ['js', 'ts', 'jsx', 'tsx'], category: 'lint',
    install: 'npm install -g eslint', checkCommand: 'eslint --version',
    runCommand: 'eslint --format json {files}', outputFormat: 'json',
    installType: 'npm', packageName: 'eslint' },

  { name: 'biome', languages: ['js', 'ts', 'jsx', 'tsx', 'json'], category: 'lint',
    install: 'npm install -g @biomejs/biome', checkCommand: 'biome --version',
    runCommand: 'biome check --reporter=json {files}', outputFormat: 'json',
    installType: 'npm', packageName: '@biomejs/biome' },

  { name: 'oxlint', languages: ['js', 'ts', 'jsx', 'tsx'], category: 'lint',
    install: 'npm install -g oxlint', checkCommand: 'oxlint --version',
    runCommand: 'oxlint --format=json {files}', outputFormat: 'json',
    installType: 'npm', packageName: 'oxlint' },

  // ─── Python ──────────────────────────────────────────────────────────
  { name: 'ruff', languages: ['py'], category: 'lint',
    install: 'pip install ruff', checkCommand: 'ruff --version',
    runCommand: 'ruff check --output-format=json {files}', outputFormat: 'json',
    installType: 'pip', packageName: 'ruff' },

  { name: 'pylint', languages: ['py'], category: 'lint',
    install: 'pip install pylint', checkCommand: 'pylint --version',
    runCommand: 'pylint --output-format=json {files}', outputFormat: 'json',
    installType: 'pip', packageName: 'pylint' },

  { name: 'flake8', languages: ['py'], category: 'lint',
    install: 'pip install flake8', checkCommand: 'flake8 --version',
    runCommand: 'flake8 --format=json {files}', outputFormat: 'json',
    installType: 'pip', packageName: 'flake8' },

  { name: 'bandit', languages: ['py'], category: 'security',
    install: 'pip install bandit', checkCommand: 'bandit --version',
    runCommand: 'bandit -r -f json {files}', outputFormat: 'json',
    installType: 'pip', packageName: 'bandit' },

  { name: 'mypy', languages: ['py'], category: 'type-check',
    install: 'pip install mypy', checkCommand: 'mypy --version',
    runCommand: 'mypy --show-error-codes {files}', outputFormat: 'text',
    installType: 'pip', packageName: 'mypy' },

  // ─── Go ──────────────────────────────────────────────────────────────
  { name: 'golangci-lint', languages: ['go'], category: 'lint',
    install: 'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest',
    checkCommand: 'golangci-lint --version',
    runCommand: 'golangci-lint run --out-format json ./...', outputFormat: 'json',
    installType: 'go', packageName: 'golangci-lint' },

  { name: 'gosec', languages: ['go'], category: 'security',
    install: 'go install github.com/securego/gosec/v2/cmd/gosec@latest',
    checkCommand: 'gosec --version',
    runCommand: 'gosec -fmt=json ./...', outputFormat: 'json',
    installType: 'go', packageName: 'gosec' },

  { name: 'staticcheck', languages: ['go'], category: 'lint',
    install: 'go install honnef.co/go/tools/cmd/staticcheck@latest',
    checkCommand: 'staticcheck --version',
    runCommand: 'staticcheck -f json ./...', outputFormat: 'json',
    installType: 'go', packageName: 'staticcheck' },

  // ─── Java ────────────────────────────────────────────────────────────
  { name: 'pmd', languages: ['java'], category: 'lint',
    install: 'brew install pmd', checkCommand: 'pmd --version',
    runCommand: 'pmd check -d {files} -f json -R rulesets/java/quickstart.xml', outputFormat: 'json',
    installType: 'brew', packageName: 'pmd' },

  { name: 'infer', languages: ['java', 'c', 'cpp'], category: 'security',
    install: 'brew install infer', checkCommand: 'infer --version',
    runCommand: 'infer run -- {files}', outputFormat: 'json',
    installType: 'brew', packageName: 'infer' },

  { name: 'spotbugs', languages: ['java'], category: 'security',
    install: 'Download from https://spotbugs.github.io/',
    checkCommand: 'spotbugs -version',
    runCommand: 'spotbugs -xml {files}', outputFormat: 'xml',
    installType: 'manual', packageName: 'spotbugs' },

  { name: 'checkstyle', languages: ['java'], category: 'lint',
    install: 'brew install checkstyle', checkCommand: 'checkstyle --version',
    runCommand: 'checkstyle -f json {files}', outputFormat: 'json',
    installType: 'brew', packageName: 'checkstyle' },

  // ─── Kotlin ──────────────────────────────────────────────────────────
  { name: 'detekt', languages: ['kt', 'kotlin'], category: 'lint',
    install: 'brew install detekt', checkCommand: 'detekt --version',
    runCommand: 'detekt --input {files} --report json:detekt-report.json', outputFormat: 'json',
    installType: 'brew', packageName: 'detekt' },

  { name: 'ktlint', languages: ['kt', 'kotlin'], category: 'lint',
    install: 'brew install ktlint', checkCommand: 'ktlint --version',
    runCommand: 'ktlint --reporter=json {files}', outputFormat: 'json',
    installType: 'brew', packageName: 'ktlint' },

  // ─── Rust ────────────────────────────────────────────────────────────
  { name: 'clippy', languages: ['rs'], category: 'lint',
    install: 'rustup component add clippy', checkCommand: 'cargo clippy --version',
    runCommand: 'cargo clippy --message-format=json', outputFormat: 'json',
    installType: 'rustup', packageName: 'clippy' },

  // ─── Ruby ────────────────────────────────────────────────────────────
  { name: 'rubocop', languages: ['rb'], category: 'lint',
    install: 'gem install rubocop', checkCommand: 'rubocop --version',
    runCommand: 'rubocop --format json {files}', outputFormat: 'json',
    installType: 'gem', packageName: 'rubocop' },

  { name: 'brakeman', languages: ['rb'], category: 'security',
    install: 'gem install brakeman', checkCommand: 'brakeman --version',
    runCommand: 'brakeman -f json', outputFormat: 'json',
    installType: 'gem', packageName: 'brakeman' },

  // ─── Swift ───────────────────────────────────────────────────────────
  { name: 'swiftlint', languages: ['swift'], category: 'lint',
    install: 'brew install swiftlint', checkCommand: 'swiftlint version',
    runCommand: 'swiftlint lint --reporter json {files}', outputFormat: 'json',
    installType: 'brew', packageName: 'swiftlint' },

  // ─── PHP ─────────────────────────────────────────────────────────────
  { name: 'phpstan', languages: ['php'], category: 'lint',
    install: 'composer global require phpstan/phpstan', checkCommand: 'phpstan --version',
    runCommand: 'phpstan analyse --error-format=json {files}', outputFormat: 'json',
    installType: 'composer', packageName: 'phpstan' },

  { name: 'phpmd', languages: ['php'], category: 'lint',
    install: 'composer global require phpmd/phpmd', checkCommand: 'phpmd --version',
    runCommand: 'phpmd {files} json cleancode,codesize,controversial,design,naming,unusedcode',
    outputFormat: 'json', installType: 'composer', packageName: 'phpmd' },

  { name: 'psalm', languages: ['php'], category: 'type-check',
    install: 'composer global require vimeo/psalm', checkCommand: 'psalm --version',
    runCommand: 'psalm --output-format=json {files}', outputFormat: 'json',
    installType: 'composer', packageName: 'vimeo/psalm' },

  // ─── C/C++ ──────────────────────────────────────────────────────────
  { name: 'clang-tidy', languages: ['c', 'cpp', 'h', 'hpp'], category: 'lint',
    install: 'apt install clang-tidy', checkCommand: 'clang-tidy --version',
    runCommand: 'clang-tidy {files} -- -std=c++17', outputFormat: 'text',
    installType: 'apt', packageName: 'clang-tidy' },

  { name: 'cppcheck', languages: ['c', 'cpp', 'h', 'hpp'], category: 'security',
    install: 'apt install cppcheck', checkCommand: 'cppcheck --version',
    runCommand: 'cppcheck --enable=all --template=json {files}', outputFormat: 'json',
    installType: 'apt', packageName: 'cppcheck' },

  // ─── Shell ───────────────────────────────────────────────────────────
  { name: 'shellcheck', languages: ['sh', 'bash'], category: 'lint',
    install: 'apt install shellcheck', checkCommand: 'shellcheck --version',
    runCommand: 'shellcheck -f json {files}', outputFormat: 'json',
    installType: 'apt', packageName: 'shellcheck' },

  // ─── SQL ─────────────────────────────────────────────────────────────
  { name: 'sqlfluff', languages: ['sql'], category: 'lint',
    install: 'pip install sqlfluff', checkCommand: 'sqlfluff version',
    runCommand: 'sqlfluff lint --format json {files}', outputFormat: 'json',
    installType: 'pip', packageName: 'sqlfluff' },

  // ─── IaC / DevOps ────────────────────────────────────────────────────
  { name: 'checkov', languages: ['tf', 'yaml', 'yml', 'json'], category: 'iac-security',
    install: 'pip install checkov', checkCommand: 'checkov --version',
    runCommand: 'checkov -d . --output json', outputFormat: 'json',
    installType: 'pip', packageName: 'checkov' },

  { name: 'trivy', languages: ['tf', 'yaml', 'yml', 'dockerfile', 'json'], category: 'security',
    install: 'brew install trivy', checkCommand: 'trivy --version',
    runCommand: 'trivy fs --format json .', outputFormat: 'json',
    installType: 'brew', packageName: 'trivy' },

  { name: 'tflint', languages: ['tf'], category: 'lint',
    install: 'brew install tflint', checkCommand: 'tflint --version',
    runCommand: 'tflint --format json', outputFormat: 'json',
    installType: 'brew', packageName: 'tflint' },

  { name: 'hadolint', languages: ['dockerfile'], category: 'lint',
    install: 'brew install hadolint', checkCommand: 'hadolint --version',
    runCommand: 'hadolint -f json {files}', outputFormat: 'json',
    installType: 'brew', packageName: 'hadolint' },

  { name: 'terrascan', languages: ['tf'], category: 'iac-security',
    install: 'brew install terrascan', checkCommand: 'terrascan version',
    runCommand: 'terrascan scan -o json', outputFormat: 'json',
    installType: 'brew', packageName: 'terrascan' },

  // ─── Security Scanners ──────────────────────────────────────────────
  { name: 'semgrep', languages: ['*'], category: 'security',
    install: 'pip install semgrep', checkCommand: 'semgrep --version',
    runCommand: 'semgrep scan --json --config auto .', outputFormat: 'json',
    installType: 'pip', packageName: 'semgrep' },

  { name: 'osv-scanner', languages: ['*'], category: 'security',
    install: 'go install github.com/google/osv-scanner/cmd/osv-scanner@latest',
    checkCommand: 'osv-scanner --version',
    runCommand: 'osv-scanner --format json -r .', outputFormat: 'json',
    installType: 'go', packageName: 'osv-scanner' },

  { name: 'trufflehog', languages: ['*'], category: 'security',
    install: 'brew install trufflehog', checkCommand: 'trufflehog --version',
    runCommand: 'trufflehog filesystem --json .', outputFormat: 'json',
    installType: 'brew', packageName: 'trufflehog' },

  { name: 'ast-grep', languages: ['*'], category: 'security',
    install: 'npm install -g @ast-grep/cli', checkCommand: 'ast-grep --version',
    runCommand: 'ast-grep scan --json .', outputFormat: 'json',
    installType: 'npm', packageName: '@ast-grep/cli' },

  { name: 'gitleaks', languages: ['*'], category: 'security',
    install: 'brew install gitleaks', checkCommand: 'gitleaks version',
    runCommand: 'gitleaks detect --report-format json --report-path gitleaks.json',
    outputFormat: 'json', installType: 'brew', packageName: 'gitleaks' },

  { name: 'bearer', languages: ['*'], category: 'security',
    install: 'brew install bearer/tap/bearer', checkCommand: 'bearer version',
    runCommand: 'bearer scan --format json .', outputFormat: 'json',
    installType: 'brew', packageName: 'bearer' },

  { name: 'codeql', languages: ['*'], category: 'security',
    install: 'Install from https://codeql.github.com/',
    checkCommand: 'codeql version',
    runCommand: 'codeql database analyze --format=json', outputFormat: 'json',
    installType: 'manual', packageName: 'codeql' },

  // ─── CI/CD ──────────────────────────────────────────────────────────
  { name: 'actionlint', languages: ['yaml', 'yml'], category: 'ci',
    install: 'go install github.com/rhysd/actionlint/cmd/actionlint@latest',
    checkCommand: 'actionlint --version',
    runCommand: 'actionlint -format json', outputFormat: 'json',
    installType: 'go', packageName: 'actionlint' },

  { name: 'zizmor', languages: ['yaml', 'yml'], category: 'ci',
    install: 'pip install zizmor', checkCommand: 'zizmor --version',
    runCommand: 'zizmor --format json .', outputFormat: 'json',
    installType: 'pip', packageName: 'zizmor' },

  // ─── Markdown / Docs ─────────────────────────────────────────────────
  { name: 'markdownlint', languages: ['md'], category: 'lint',
    install: 'npm install -g markdownlint-cli', checkCommand: 'markdownlint --version',
    runCommand: 'markdownlint --json {files}', outputFormat: 'json',
    installType: 'npm', packageName: 'markdownlint-cli' },

  // ─── CSS / Styles ────────────────────────────────────────────────────
  { name: 'stylelint', languages: ['css', 'scss', 'less'], category: 'lint',
    install: 'npm install -g stylelint', checkCommand: 'stylelint --version',
    runCommand: 'stylelint --formatter json {files}', outputFormat: 'json',
    installType: 'npm', packageName: 'stylelint' },

  // ─── XML / HTML ──────────────────────────────────────────────────────
  { name: 'htmlhint', languages: ['html', 'htm'], category: 'lint',
    install: 'npm install -g htmlhint', checkCommand: 'htmlhint --version',
    runCommand: 'htmlhint --format json {files}', outputFormat: 'json',
    installType: 'npm', packageName: 'htmlhint' },

  // ─── Misc ────────────────────────────────────────────────────────────
  { name: 'npm-audit', languages: ['js', 'ts'], category: 'dependency',
    install: 'Built-in with npm', checkCommand: 'npm --version',
    runCommand: 'npm audit --json', outputFormat: 'json',
    installType: 'builtin', packageName: 'npm' },

  { name: 'pip-audit', languages: ['py'], category: 'dependency',
    install: 'pip install pip-audit', checkCommand: 'pip-audit --version',
    runCommand: 'pip-audit --format json', outputFormat: 'json',
    installType: 'pip', packageName: 'pip-audit' },

  { name: 'cargo-audit', languages: ['rs'], category: 'dependency',
    install: 'cargo install cargo-audit', checkCommand: 'cargo audit --version',
    runCommand: 'cargo audit --json', outputFormat: 'json',
    installType: 'cargo', packageName: 'cargo-audit' },

  { name: 'bundler-audit', languages: ['rb'], category: 'dependency',
    install: 'gem install bundler-audit', checkCommand: 'bundle-audit --version',
    runCommand: 'bundle-audit check --format json', outputFormat: 'json',
    installType: 'gem', packageName: 'bundler-audit' },

  // ─── Secrets ─────────────────────────────────────────────────────────
  { name: 'detect-secrets', languages: ['*'], category: 'security',
    install: 'pip install detect-secrets', checkCommand: 'detect-secrets --version',
    runCommand: 'detect-secrets scan --all-files .', outputFormat: 'json',
    installType: 'pip', packageName: 'detect-secrets' },

  { name: 'whispers', languages: ['*'], category: 'security',
    install: 'pip install whispers', checkCommand: 'whispers --version',
    runCommand: 'whispers --format json .', outputFormat: 'json',
    installType: 'pip', packageName: 'whispers' },
];

// Language → file extension mapping
const LANG_EXTENSIONS = {
  js: ['js', 'mjs', 'cjs'],
  ts: ['ts', 'mts', 'cts'],
  jsx: ['jsx'],
  tsx: ['tsx'],
  py: ['py', 'pyw', 'pyi'],
  go: ['go'],
  java: ['java'],
  kt: ['kt', 'kts'],
  kotlin: ['kt', 'kts'],
  rs: ['rs'],
  rb: ['rb', 'rake'],
  swift: ['swift'],
  php: ['php'],
  c: ['c', 'h'],
  cpp: ['cpp', 'cc', 'cxx', 'hpp', 'hxx'],
  h: ['h'],
  hpp: ['hpp', 'hxx'],
  sh: ['sh', 'bash', 'zsh'],
  bash: ['sh', 'bash'],
  sql: ['sql'],
  tf: ['tf', 'tfvars'],
  yaml: ['yaml', 'yml'],
  yml: ['yaml', 'yml'],
  json: ['json'],
  md: ['md', 'mdx'],
  css: ['css'],
  scss: ['scss'],
  less: ['less'],
  html: ['html', 'htm'],
  htm: ['html', 'htm'],
  dockerfile: ['dockerfile'],
};

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this._registerTools();
  }

  _registerTools() {
    for (const tool of TOOLS) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Get all registered tools.
   */
  getAllTools() {
    return [...this.tools.values()];
  }

  /**
   * Get tools applicable to a specific language/extension.
   */
  getToolsForLanguage(language) {
    const ext = language.toLowerCase();
    return [...this.tools.values()].filter(tool =>
      tool.languages.includes(ext) || tool.languages.includes('*')
    );
  }

  /**
   * Get tools applicable to a set of file extensions.
   */
  getToolsForExtensions(extensions) {
    const extSet = new Set(extensions.map(e => e.toLowerCase()));
    return [...this.tools.values()].filter(tool =>
      tool.languages.includes('*') ||
      tool.languages.some(lang => {
        const langExts = LANG_EXTENSIONS[lang] || [lang];
        return langExts.some(le => extSet.has(le));
      })
    );
  }

  /**
   * Get a specific tool by name.
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  /**
   * Get tools by category.
   */
  getToolsByCategory(category) {
    return [...this.tools.values()].filter(t => t.category === category);
  }

  /**
   * Get total tool count.
   */
  get count() {
    return this.tools.size;
  }
}

export const toolRegistry = new ToolRegistry();
export default toolRegistry;
