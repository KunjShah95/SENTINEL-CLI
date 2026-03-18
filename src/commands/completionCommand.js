import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

export class CompletionCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
    }

    async run(args) {
        const shell = args[0] || 'bash';
        
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white('Sentinel Shell Completion'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        switch (shell) {
            case 'bash':
                return this.generateBashCompletion();
            case 'zsh':
                return this.generateZshCompletion();
            case 'fish':
                return this.generateFishCompletion();
            case 'powershell':
                return this.generatePowerShellCompletion();
            case 'install':
                return this.installCompletion();
            default:
                this.showHelp();
        }
    }

    generateBashCompletion() {
        const completion = `#!/bin/bash

# Sentinel CLI Bash Completion
# Add to your ~/.bashrc: source /path/to/sentinel-completion.bash

_sentinel_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    opts="analyze audit auth benchmark build ci config dashboard db 
          diff docker fix git help init install-hooks lint metrics 
          models notify pre-commit pr review score search security-audit 
          setup status test trends watch plugin env ignore report doctor"

    case "${prev}" in
        sentinel)
            COMPREPLY=($(compgen -W "${opts}" -- ${cur}))
            return 0
            ;;
        analyze|audit|fix|review)
            COMPREPLY=($(compgen -f -- ${cur}))
            return 0
            ;;
        --analyzers)
            COMPREPLY=($(compgen -W "security quality bugs dependency accessibility performance typescript react vue" -- ${cur}))
            return 0
            ;;
        --format)
            COMPREPLY=($(compgen -W "console json html markdown csv junit sarif" -- ${cur}))
            return 0
            ;;
        --staged|--json|--verbose|--silent)
            return 0
            ;;
    esac

    if [[ ${cur} == -* ]] ; then
        COMPREPLY=($(compgen -W "--help --version --project --format --analyzers --staged --verbose --silent --output --commit --branch" -- ${cur}))
        return 0
    fi
    
    COMPREPLY=($(compgen -W "${opts}" -- ${cur}))
    return 0
}

complete -F _sentinel_completion sentinel
`;

        console.log(chalk.gray('  Bash completion generated.\n'));
        console.log(chalk.white('  Add to your ~/.bashrc:\n'));
        console.log(chalk.cyan('    source <(sentinel completion bash)\n'));
        console.log(chalk.gray('  Or save to file and source:\n'));
        console.log(chalk.cyan('    sentinel completion bash > ~/.sentinel-completion.bash'));
        console.log(chalk.gray('    echo "source ~/.sentinel-completion.bash" >> ~/.bashrc\n'));

        return { shell: 'bash', completion };
    }

    generateZshCompletion() {
        const completion = `#compdef sentinel

# Sentinel CLI Zsh Completion

local -a commands
commands=(
    'analyze:Analyze code for issues'
    'audit:Run security audit'
    'auth:Configure authentication'
    'benchmark:Run performance benchmark'
    'build:Build the project'
    'ci:Run CI pipeline'
    'config:Manage configuration'
    'dashboard:Launch dashboard'
    'db:Database operations'
    'diff:Show PR diff review'
    'docker:Docker operations'
    'fix:Auto-fix issues'
    'git:Run git commands'
    'help:Show help'
    'init:Initialize project'
    'install-hooks:Install pre-commit hooks'
    'lint:Run linter'
    'metrics:Show metrics'
    'models:List AI models'
    'notify:Send notifications'
    'pre-commit:Run pre-commit checks'
    'pr:PR operations'
    'review:Code review'
    'score:Show project score'
    'search:Search the web'
    'security-audit:Security audit'
    'setup:Setup sentinel'
    'status:Show status'
    'test:Run tests'
    'trends:Show trends'
    'watch:Watch for changes'
    'plugin:Manage plugins'
    'env:Manage environment'
    'ignore:Manage ignore rules'
    'report:Generate reports'
    'doctor:Health check'
)

local -a options
options=(
    '--help[Show help]'
    '--version[Show version]'
    '--project[Project path]:path:_files'
    '--format[Output format]:format:(console json html markdown csv junit sarif)'
    '--analyzers[Analyzers to run]:analyzers:(security quality bugs dependency accessibility performance)'
    '--staged[Analyze staged changes]'
    '--verbose[Verbose output]'
    '--silent[Silent mode]'
    '--output[Output file]:file:_files'
)

if (( CURRENT == 2 )); then
    _describe 'command' commands
elif (( CURRENT == 3 )); then
    case "${words[2]}" in
        analyze|audit|fix|review)
            _files
            ;;
    esac
fi

return 0
`;

        console.log(chalk.gray('  Zsh completion generated.\n'));
        console.log(chalk.white('  Add to your ~/.zshrc:\n'));
        console.log(chalk.cyan('    source <(sentinel completion zsh)\n'));
        console.log(chalk.gray('  Or save to file:\n'));
        console.log(chalk.cyan('    sentinel completion zsh > ~/.zsh/_sentinel\n'));

        return { shell: 'zsh', completion };
    }

    generateFishCompletion() {
        const completion = `# Sentinel CLI Fish Shell Completion

# Install: sentinel completion fish > ~/.config/fish/completions/sentinel.fish

complete -c sentinel -f -n '__fish_use_subcommand' -a 'analyze' -d 'Analyze code for issues'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'audit' -d 'Run security audit'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'auth' -d 'Configure authentication'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'benchmark' -d 'Run performance benchmark'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'build' -d 'Build the project'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'ci' -d 'Run CI pipeline'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'config' -d 'Manage configuration'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'dashboard' -d 'Launch dashboard'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'diff' -d 'Show PR diff review'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'fix' -d 'Auto-fix issues'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'init' -d 'Initialize project'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'score' -d 'Show project score'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'watch' -d 'Watch for changes'
complete -c sentinel -f -n '__fish_use_subcommand' -a 'doctor' -d 'Health check'

complete -c sentinel -f -n '__fish_contains_opt --project' -a '(ls -d *)' -d 'Project directory'
complete -c sentinel -f -n '__fish_contains_opt --format' -a 'console json html markdown csv junit sarif' -d 'Output format'
complete -c sentinel -f -n '__fish_contains_opt --analyzers' -a 'security quality bugs dependency accessibility performance' -d 'Analyzer'

complete -c sentinel -l help -d 'Show help'
complete -c sentinel -l version -d 'Show version'
complete -c sentinel -l staged -d 'Analyze staged changes'
complete -c sentinel -l verbose -d 'Verbose output'
complete -c sentinel -l silent -d 'Silent mode'
`;

        console.log(chalk.gray('  Fish completion generated.\n'));
        console.log(chalk.white('  Install:\n'));
        console.log(chalk.cyan('    sentinel completion fish > ~/.config/fish/completions/sentinel.fish\n'));

        return { shell: 'fish', completion };
    }

    generatePowerShellCompletion() {
        const completion = `
# Sentinel CLI PowerShell Completion
# Add to your $PROFILE

$script:SentinelCommands = @(
    'analyze', 'audit', 'auth', 'benchmark', 'build', 'ci', 'config',
    'dashboard', 'db', 'diff', 'docker', 'fix', 'git', 'help', 'init',
    'install-hooks', 'lint', 'metrics', 'models', 'notify', 'pre-commit',
    'pr', 'review', 'score', 'search', 'security-audit', 'setup',
    'status', 'test', 'trends', 'watch', 'plugin', 'env', 'ignore',
    'report', 'doctor'
)

$script:SentinelOptions = @(
    '--help', '--version', '--project', '--format', '--analyzers',
    '--staged', '--verbose', '--silent', '--output'
)

Register-ArgumentCompleter -CommandName sentinel -ParameterName Command -ScriptBlock {
    param($wordToComplete, $commandDetails, $cursorPosition)
    $script:SentinelCommands | Where-Object { $_ -like "*$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}

Register-ArgumentCompleter -CommandName sentinel -ParameterName Format -ScriptBlock {
    param($wordToComplete, $commandDetails, $cursorPosition)
    @('console', 'json', 'html', 'markdown', 'csv', 'junit', 'sarif') | Where-Object { $_ -like "*$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
`;

        console.log(chalk.gray('  PowerShell completion generated.\n'));
        console.log(chalk.white('  Add to your $PROFILE:\n'));
        console.log(chalk.cyan('    sentinel completion powershell >> $PROFILE\n'));

        return { shell: 'powershell', completion };
    }

    async installCompletion() {
        const fs = await import('fs/promises');
        
        const shells = ['bash', 'zsh', 'fish'];
        const home = process.env.HOME || process.env.USERPROFILE;
        
        for (const shell of shells) {
            try {
                let content;
                switch (shell) {
                    case 'bash':
                        content = this.generateBashCompletion().completion;
                        break;
                    case 'zsh':
                        content = this.generateZshCompletion().completion;
                        break;
                    case 'fish':
                        content = this.generateFishCompletion().completion;
                        break;
                }
                
                const filePath = path.join(home, `.sentinel-complete-${shell}`);
                await fs.writeFile(filePath, content);
                console.log(chalk.green(`  ✓ Installed ${shell} completion`));
            } catch (e) {
                console.log(chalk.yellow(`  ⚠ Could not install ${shell} completion`));
            }
        }
        
        console.log(chalk.green('\n  ✓ Shell completions installed!\n'));
    }

    showHelp() {
        console.log(chalk.cyan('\n  Shell Completion:\n'));
        console.log(chalk.gray('    sentinel completion bash        Generate bash completion'));
        console.log(chalk.gray('    sentinel completion zsh         Generate zsh completion'));
        console.log(chalk.gray('    sentinel completion fish        Generate fish completion'));
        console.log(chalk.gray('    sentinel completion powershell  Generate PowerShell completion'));
        console.log(chalk.gray('    sentinel completion install    Install completions\n'));
    }
}

export async function runCompletionCommand(args, options = {}) {
    const command = new CompletionCommand(options);
    return command.run(args);
}

export default { CompletionCommand, runCompletionCommand };
