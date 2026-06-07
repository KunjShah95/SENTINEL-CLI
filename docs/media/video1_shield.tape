Output docs/media/video1_shield.gif

Require sentinel

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 800
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 60ms

# Install Sentinel
Type "npm install -g sentinel-cli"
Sleep 500ms
Enter
Sleep 3s

# Clear the screen
Type "clear"
Enter
Sleep 500ms

# Run the first scan
Type "sentinel analyze --format console"
Sleep 500ms
Enter

# Give it time to analyze and print the results
Sleep 6s

# Show the interactive AI chat mode (TUI)
Type "sentinel tui"
Sleep 500ms
Enter
Sleep 3s

# Exit TUI (simulate Ctrl+C or quitting)
Ctrl+C
Sleep 1s
