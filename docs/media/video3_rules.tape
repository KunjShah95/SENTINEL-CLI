Output docs/media/video3_rules.gif

Require sentinel

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 800
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 60ms

# Show creating custom rules
Type "cat << 'EOF' > .sentinelrules.yaml"
Enter
Type "rules:"
Enter
Type "  - id: no-console-log"
Enter
Type "    severity: medium"
Enter
Type "    description: 'Avoid using console.log in production'"
Enter
Type "    pattern: 'console\\.log\\(.*\\)'"
Enter
Type "    languages: ['javascript', 'typescript']"
Enter
Type "EOF"
Enter
Sleep 1.5s

# Clear the screen
Type "clear"
Enter

# Run scan with custom policy
Type "sentinel analyze --analyzers custom"
Sleep 500ms
Enter

# Wait for scan to finish
Sleep 4s

Type "echo 'Sentinel successfully applied the custom guardrails!'"
Enter
Sleep 3s
