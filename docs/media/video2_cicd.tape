Output docs/media/video2_cicd.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 800
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 60ms

# Show creating the GitHub Action workflow
Type "mkdir -p .github/workflows"
Sleep 300ms
Enter

Type "cat << 'EOF' > .github/workflows/sentinel.yml"
Enter
Type "name: Security Audit"
Enter
Type "on: [pull_request]"
Enter
Type "jobs:"
Enter
Type "  scan:"
Enter
Type "    runs-on: ubuntu-latest"
Enter
Type "    steps:"
Enter
Type "      - uses: actions/checkout@v4"
Enter
Type "      - uses: KunjShah95/SENTINEL-CLI@main"
Enter
Type "        with:"
Enter
Type "          post_pr_comment: 'true'"
Enter
Type "          fail_on_error: 'true'"
Enter
Type "EOF"
Enter
Sleep 1.5s

# Clear the screen
Type "clear"
Enter

# Simulate pushing to trigger PR
Type "git add .github/workflows/sentinel.yml"
Enter
Sleep 300ms
Type "git commit -m 'Add Sentinel Security Action'"
Enter
Sleep 500ms
Type "git push origin main"
Enter

Sleep 2s
Type "echo 'Sentinel will now automatically comment on every PR with security findings!'"
Enter
Sleep 4s
