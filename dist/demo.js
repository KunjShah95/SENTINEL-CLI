#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

class Demo {
  constructor() {
    this.demoFiles = {
      'example.js': `// Example JavaScript file with various issues
const API_KEY = process.env.API_KEY || "<API_KEY>"; // Security: Use environment variable
var userInput = req.body.data; // Quality: Using var instead of let/const
var password = process.env.PASSWORD || "<PASSWORD>"; // Security: Use environment variable

function processData(data) {
    if (data = null) { // Bug: Assignment instead of comparison
        console.log("Processing..."); // Quality: Console statement
    }
    
    for (var i = 0; i < data.length; i++) { // Performance: Inefficient loop
        result += data[i] + ","; // Performance: String concatenation in loop
        eval("process(" + data[i] + ")"); // Security: eval usage
    }
    
    // Bug: Missing break statement
    switch(data.type) {
        case "A":
            handleA();
        case "B":
            handleB();
            break;
    }
}

function inefficientFunction() {
    const start = Date.now();
    for (let i = 0; i < 1000000; i++) {
        const obj = new Object(); // Performance: Unnecessary object creation
        arr.push(obj); // Performance: Array modification in nested context
    }
    console.log("Time:", Date.now() - start);
}

document.querySelector('#button').addEventListener('click', function() {
    for (let i = 0; i < 100; i++) {
        const element = document.querySelector('.item-' + i); // Performance: DOM query in loop
        element.innerHTML = "Clicked"; // Security: innerHTML usage
    }
});`,

      'app.py': `# Example Python file with issues
import os
import pickle

def process_user_data(data):
    if data = None:  # Bug: Assignment instead of comparison
        print("Invalid data")  # Quality: Print statement
        return None
    
    result = ""  # Performance: String concatenation in loop
    for item in data:
        result += item + ","  # Performance: String concatenation in loop
    
    # Security: Pickle deserialization
    processed_data = pickle.loads(data)
    
    # Security: Shell command execution
    os.system("rm -rf /tmp/" + data.get('temp_dir', 'default'))
    
    return processed_data

def process_files(file_list):
    # Bug: Mutable default argument
    def process_with_options(options={"debug": False, "timeout": 30}):
        # Bug: Exception without specific type
        try:
            if options["debug"]:
                print("Debug mode enabled")
            return process_user_data(file_list)
        except:  # Quality: Bare except clause
            print("Error occurred")
            return None
    
    return process_with_options()

# Performance: File operations without proper resource management
def read_large_file(filename):
    file = open(filename, 'r')  # Bug: No proper file closing
    content = file.read()
    return content

# Quality: Missing function documentation
def calculate_metrics(data):
    total = sum(data)
    average = total / len(data)
    return {"total": total, "average": average}`,

      'utils.java': `// Example Java file with issues
import java.io.*;
import java.sql.*;

public class Utils {
    // Security: Hardcoded password
    private static final String DB_PASSWORD = System.getenv("DB_PASSWORD");
    
    public void processData() {
        // Bug: Missing break statement
        switch(getUserType()) {
            case "admin":
                grantFullAccess();
            case "user":
                grantBasicAccess();
                break;
            default:
                denyAccess();
        }
    }
    
    public void databaseExample() {
        try {
            // Performance: String concatenation in loop
            String query = "SELECT * FROM users WHERE ";
            for (int i = 0; i < conditions.size(); i++) {
                query += "condition" + i + " = ? AND ";  // Performance: String concatenation
            }
            
            // Security: SQL injection risk
            Statement stmt = connection.createStatement();
            ResultSet rs = stmt.executeQuery(query);
            
            // Bug: Resource leak
            FileInputStream fis = new FileInputStream("data.txt");
            // Missing: fis.close()
            
        } catch (Exception e) {
            e.printStackTrace();  // Quality: Using printStackTrace
        }
    }
    
    // Quality: Missing method documentation
    public void handleFile(String filename) {
        try {
            // Performance: Synchronous I/O
            Thread.sleep(1000);  // Performance: Blocking operation
            FileInputStream fis = new FileInputStream(filename);
            BufferedReader reader = new BufferedReader(new InputStreamReader(fis));
            String line;
            while ((line = reader.readLine()) != null) {
                System.out.println(line);  // Quality: System.out.println
            }
        } catch (IOException e) {
            // Quality: Generic exception handling
            System.out.println("Error: " + e.getMessage());
        }
    }
    
    private String getUserType() {
        return "user";
    }
    
    private void grantFullAccess() {
        // Implementation
    }
    
    private void grantBasicAccess() {
        // Implementation
    }
    
    private void denyAccess() {
        // Implementation
    }
}`,

      'config.php': `<?php
// Example PHP file with issues

// Security: Hardcoded credentials
$db_host = "localhost";
$db_user = "admin";
$db_pass = getenv('DB_PASSWORD') ?: '<PASSWORD>';

// Security: SQL injection risk
function getUserData($user_id) {
    $query = "SELECT * FROM users WHERE id = " . $user_id;  // Security: SQL injection
    $result = mysql_query($query);  // Deprecated function
    
    while ($row = mysql_fetch_assoc($result)) {
        echo $row['password'] . "<br>";  // Security: Exposing password
    }
}

// Security: File inclusion vulnerability
function loadModule($module_name) {
    include($_GET['module'] . ".php");  // Security: File inclusion
}

// Performance: Inefficient database queries
function getRecentPosts() {
    $posts = array();
    $query = "SELECT * FROM posts ORDER BY created DESC LIMIT 100";
    $result = mysql_query($query);
    
    while ($row = mysql_fetch_assoc($result)) {
        // Performance: N+1 query pattern
        $user_query = "SELECT * FROM users WHERE id = " . $row['user_id'];
        $user_result = mysql_query($user_query);
        $row['user'] = mysql_fetch_assoc($user_result);
        
        $posts[] = $row;
    }
    
    return $posts;
}

// Quality: Missing input validation
function processForm() {
    $name = $_POST['name'];  // Quality: No input validation
    $email = $_POST['email'];  // Quality: No email validation
    
    // Quality: No CSRF protection
    // Quality: No sanitization
    echo "Hello " . $name . ", your email is " . $email;
}

?>`,
    };
  }

  async run() {
    console.log(chalk.green.bold('🚀 Welcome to the Sentinel Demo!'));
    console.log(chalk.gray('This demo will create example files with various code issues.\n'));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          'Create demo files with issues',
          'Show configuration options',
          'Run analysis on demo files',
          'Exit',
        ],
      },
    ]);

    switch (action) {
    case 'Create demo files with issues':
      await this.createDemoFiles();
      break;
    case 'Show configuration options':
      await this.showConfigOptions();
      break;
    case 'Run analysis on demo files':
      await this.runAnalysis();
      break;
    case 'Exit':
      console.log(chalk.blue('👋 Thanks for trying Sentinel!'));
      process.exit(0);
    }
  }

  async createDemoFiles() {
    console.log(chalk.yellow('\n📁 Creating demo files...\n'));

    for (const [filename, content] of Object.entries(this.demoFiles)) {
      const filepath = path.join(process.cwd(), filename);
      await fs.writeFile(filepath, content);
      console.log(chalk.green(`✓ Created ${filename}`));
    }

    console.log(chalk.blue('\n🎯 Demo files created successfully!'));
    console.log(chalk.gray('These files contain common issues that the bot can detect:'));
    console.log(chalk.gray('• Security vulnerabilities'));
    console.log(chalk.gray('• Code quality issues'));
    console.log(chalk.gray('• Performance problems'));
    console.log(chalk.gray('• Common bugs\n'));

    const { runAnalysis } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'runAnalysis',
        message: 'Would you like to run the analysis now?',
        default: true,
      },
    ]);

    if (runAnalysis) {
      await this.runAnalysis();
    }
  }

  async showConfigOptions() {
    console.log(chalk.blue('\n⚙️  Configuration Options:'));
    console.log(chalk.gray('The bot supports various configuration options:'));
    console.log('');
    console.log(chalk.cyan('Analyzers:'));
    console.log(chalk.gray('• Security Analyzer - Detects vulnerabilities'));
    console.log(chalk.gray('• Quality Analyzer - Checks code quality'));
    console.log(chalk.gray('• Bug Analyzer - Finds common bugs'));
    console.log(chalk.gray('• Performance Analyzer - Identifies performance issues'));
    console.log('');
    console.log(chalk.cyan('Output Formats:'));
    console.log(chalk.gray('• Console - Colored text output'));
    console.log(chalk.gray('• JSON - Machine-readable format'));
    console.log(chalk.gray('• HTML - Web report'));
    console.log(chalk.gray('• Markdown - Documentation format'));
    console.log('');
    console.log(chalk.cyan('Usage Examples:'));
    console.log(chalk.white('  node src/cli.js analyze'));
    console.log(chalk.white('  node src/cli.js analyze --format html --output report.html'));
    console.log(chalk.white('  node src/cli.js analyze --staged'));
    console.log(chalk.white('  node src/cli.js setup\n'));
  }

  async runAnalysis() {
    console.log(chalk.blue('\n🔍 Running code analysis...\n'));

    try {
      // Import and run the CLI analyze command
      const { execSync } = await import('child_process');
      execSync('node src/cli.js analyze', {
        encoding: 'utf8',
        stdio: 'inherit',
      });
    } catch (error) {
      console.log(chalk.red('Analysis completed with issues found.'));
      console.log(chalk.yellow('\nInstall dependencies first:'));
      console.log(chalk.white('  npm install'));
      console.log(chalk.yellow('\nOr run:'));
      console.log(chalk.white('  npm start\n'));
    }
  }
}

// Run demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new Demo();
  demo.run().catch(console.error);
}

export default Demo;
