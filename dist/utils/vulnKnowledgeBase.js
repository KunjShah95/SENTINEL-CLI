const vulnerabilityKnowledgeBase = {
  'eval-usage': {
    id: 'eval-usage',
    name: 'eval() Usage',
    severity: 'high',
    category: 'Code Injection',
    what: 'The eval() function in JavaScript executes a string as executable code. This is extremely dangerous because any user-supplied data passed to eval() can be executed as JavaScript code on your users browsers or your server.',
    exploit: 'An attacker who can control the input passed to eval() can execute arbitrary JavaScript code. For example, if you have eval(userInput), an attacker could send "; maliciousCode(); //" to steal cookies, session tokens, or redirect users to malicious sites. In Node.js, this could allow complete server compromise.',
    vulnerableExample: `// DANGEROUS - Don't do this!
const userInput = req.body.expression;
const result = eval(userInput);

// Or in React:
const code = new Function(userInput);
code();`,
    fixedExample: `// SAFE - Use JSON.parse for expressions
const userInput = req.body.expression;
try {
  // Only allow simple values, not arbitrary code
  const result = JSON.parse(userInput);
}

// Or use a proper expression parser:
const result = math.evaluate(userInput); // math.js library

// For React - avoid dynamic code execution entirely:
element.textContent = userInput; // Safe, treats as text not HTML`,
    cwe: 'CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code',
    references: ['https://owasp.org/www-community/attacks/Code_Injection']
  },

  'innerhtml-assignment': {
    id: 'innerhtml-assignment',
    name: 'innerHTML Assignment',
    severity: 'medium',
    category: 'XSS',
    what: 'Setting innerHTML directly with user input allows any HTML or JavaScript to be inserted into the page. This creates a Cross-Site Scripting (XSS) vulnerability.',
    exploit: 'An attacker can inject malicious scripts through form inputs, URL parameters, or API responses. When other users view this content, the script runs in their browsers with full access to cookies, local storage, and can perform actions on behalf of the user (stealing sessions, redirecting, keylogging).',
    vulnerableExample: `// DANGEROUS
document.getElementById('comments').innerHTML = userComment;

// Or in React - WRONG:
<div dangerouslySetInnerHTML={{__html: userContent}} />`,
    fixedExample: `// SAFE - Use textContent
document.getElementById('comments').textContent = userComment;

// Or sanitize with DOMPurify:
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userContent);

// In React - prefer:
<div>{userContent}</div>  // React auto-escapes

// Or if you must use dangerouslySetInnerHTML:
<div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(userContent)}} />`,
    cwe: 'CWE-79: Improper Neutralization of Input During Web Page Generation',
    references: ['https://owasp.org/www-community/attacks/xss/']
  },

  'document-write': {
    id: 'document-write',
    name: 'document.write() Usage',
    severity: 'medium',
    category: 'XSS',
    what: 'document.write() is an older method that writes HTML directly to the page. It executes synchronously and can easily introduce XSS vulnerabilities.',
    exploit: 'Similar to innerHTML, any user input passed to document.write() can inject malicious scripts. Additionally, document.write() executes after the page has loaded, which can completely replace the page content or inject scripts that run immediately.',
    vulnerableExample: `// DANGEROUS
document.write('<h1>Welcome ' + username + '</h1>');

// Attackers can inject:
username = '<script>stealCookies()</script>'`,
    fixedExample: `// SAFE - Use DOM methods
const h1 = document.createElement('h1');
h1.textContent = 'Welcome ' + username;
document.body.appendChild(h1);

// Or use a template with auto-escaping:
const template = document.createElement('template');
template.innerHTML = \`<h1>\${escapeHtml(username)}</h1>\`;`,
    cwe: 'CWE-79: Improper Neutralization of Input During Web Page Generation',
    references: ['https://developer.mozilla.org/en-US/docs/Web/API/Document/write']
  },

  'hardcoded-api-keys': {
    id: 'hardcoded-api-keys',
    name: 'Hardcoded API Keys',
    severity: 'high',
    category: 'Secrets Exposure',
    what: 'API keys, secrets, and tokens are hardcoded directly in source code. When code is committed to version control, these secrets become permanently exposed in the repository history.',
    exploit: 'Anyone with repository access (or who finds the repo online) can extract these secrets and use them to access your connected services. Attackers routinely scan GitHub and public repos for exposed keys. With your API key, they can: run up your bill, access user data, perform actions as your app, or pivot to attack other systems.',
    vulnerableExample: `// DANGEROUS - Never do this!
const apiKey = 'sk_live_abc123xyz789';
const stripe = require('stripe')(apiKey);

const AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const config = { apiKey: 'ghp_xxxxxxxxxxxx' };`,
    fixedExample: `// SAFE - Use environment variables
const apiKey = process.env.STRIPE_SECRET_KEY;
const stripe = require('stripe')(apiKey);

// In .env file (add to .gitignore):
// STRIPE_SECRET_KEY=sk_live_xxxxx

// Or use a secrets manager:
import { SecretManager } from '@aws-sdk/client-secrets-manager';
const client = new SecretManager();
const secret = await client.getSecretValue({ SecretId: 'my-api-key' });`,
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    references: ['https://docs.github.com/en/actions/security-guides/encrypted-secrets']
  },

  'sql-query-concatenation': {
    id: 'sql-query-concatenation',
    name: 'SQL Query Concatenation',
    severity: 'high',
    category: 'SQL Injection',
    what: 'Building SQL queries by concatenating strings with user input allows attackers to inject malicious SQL commands. The query becomes unintended SQL that gets executed alongside your intended query.',
    exploit: 'An attacker inputs SQL code into form fields. For example, entering OR 1=1 in a login field can bypass authentication. More dangerous attacks can: extract all data from your database, delete tables, execute system commands (in some configurations), or escalate to server compromise.',
    vulnerableExample: `// DANGEROUS - SQL Injection vulnerable
const query = "SELECT * FROM users WHERE name = '" + userInput + "'";
db.query(query);

// In Python:
cursor.execute("SELECT * FROM users WHERE id = " + user_id)

// In Java:
String query = "SELECT * FROM users WHERE name = '" + username + "'";`,
    fixedExample: `// SAFE - Use parameterized queries/prepared statements
const query = 'SELECT * FROM users WHERE name = ?';
db.query(query, [userInput]);

// In Python with parameterized queries:
cursor.execute("SELECT * FROM users WHERE name = %s", (user_input,))

// In Java with PreparedStatement:
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE name = ?");
stmt.setString(1, username);`,
    cwe: 'CWE-89: SQL Injection',
    references: ['https://owasp.org/www-community/attacks/SQL_Injection']
  },

  'pickle-deserialization': {
    id: 'pickle-deserialization',
    name: 'Pickle Deserialization',
    severity: 'high',
    category: 'Deserialization',
    what: 'Python pickle module can deserialize arbitrary Python objects. When deserializing data from untrusted sources, attackers can craft malicious objects that execute code during unpickling.',
    exploit: 'An attacker creates a pickled object that, when unpickled, executes system commands. They can send this malicious payload through: API requests, uploaded files, cached data, or message queues. This gives attackers remote code execution on your server - they can steal data, install malware, or pivot to other systems.',
    vulnerableExample: `// DANGEROUS - Never unpickle untrusted data!
import pickle

# From user input or API
data = request.form['serialized_data']
obj = pickle.loads(data)

# Also dangerous:
obj = pickle.load(open('user_data.pkl', 'rb'))`,
    fixedExample: `// SAFE - Use JSON for data serialization
import json

# Send/receive JSON instead
data = json.loads(request.form['json_data'])

# If you need structured data, use safe formats:
# - JSON
# - MessagePack
# - Protocol Buffers

# For untrusted data, explicitly validate:
import json
data = json.loads(user_input)
if not isinstance(data, dict):
    raise ValueError("Expected dict")`,
    cwe: 'CWE-502: Deserialization of Untrusted Data',
    references: ['https://docs.python.org/3/library/pickle.html']
  },

  'shell-command-execution': {
    id: 'shell-command-execution',
    name: 'Shell Command Execution',
    severity: 'medium',
    category: 'Command Injection',
    what: 'Using os.system(), subprocess.call(), or subprocess.run() with shell=True and unsanitized user input allows attackers to run arbitrary shell commands on your server.',
    exploit: 'An attacker can inject additional commands using shell metacharacters (;, |, &&, ||, $(), etc.). For example, entering ; rm -rf / as a filename could delete your entire server. Attackers can: exfiltrate data, install backdoors, pivot to other servers, or destroy infrastructure.',
    vulnerableExample: `// DANGEROUS - Command injection vulnerable
import os
import subprocess

# Never do this with user input!
os.system('ls ' + user_folder)

subprocess.call('ping ' + user_host, shell=True)

subprocess.run('convert ' + filename, shell=True)`,
    fixedExample: `// SAFE - Use list form, avoid shell=True
import subprocess

# Use list form - no shell interpretation
subprocess.run(['ls', user_folder])

# If you must use shell features, validate strictly:
import re
if not re.match(r'^[a-zA-Z0-9_-]+$', filename):
    raise ValueError("Invalid filename")
subprocess.run(['convert', filename])

# Use shell=False and pass args as lists:
subprocess.run(['ping', '-c', '4', user_host])`,
    cwe: 'CWE-78: OS Command Injection',
    references: ['https://owasp.org/www-community/attacks/Command_Injection']
  },

  'hardcoded-passwords': {
    id: 'hardcoded-passwords',
    name: 'Hardcoded Passwords',
    severity: 'high',
    category: 'Credentials Exposure',
    what: 'Passwords, database credentials, or secrets are hardcoded directly in source code. These get committed to version control and remain in git history forever.',
    exploit: 'Anyone with repository access can find these passwords. Even if you rotate them, the old passwords remain in git history. Attackers scanning public repos find these credentials and use them to: access databases, admin panels, third-party services, or the application itself.',
    vulnerableExample: `// DANGEROUS - Never hardcode passwords!
DB_PASSWORD = 'MySecretPassword123!'
ADMIN_PASS = 'admin123'

config = {
    'password': 'super-secret-key'
}

# In database connection:
conn = psycopg2.connect(
    host="localhost",
    user="admin",
    password="secret123"  // Bad!`,
    fixedExample: `// SAFE - Use environment variables
import os
DB_PASSWORD = os.environ.get('DB_PASSWORD')

# Or use a secrets manager:
import boto3
client = boto3.client('secretsmanager')
secret = client.get_secret_value(SecretId='prod/db/credentials')
DB_PASSWORD = secret['SecretString']['password']

# Use .env files (add to .gitignore):
# DB_PASSWORD=your-actual-password`,
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    references: ['https://12factor.net/config']
  },

  'weak-cryptography': {
    id: 'weak-cryptography',
    name: 'Weak Cryptography',
    severity: 'medium',
    category: 'Cryptographic Issues',
    what: 'Using deprecated or weak cryptographic algorithms like MD5, SHA1, or DES. These algorithms have known weaknesses that make them vulnerable to collision attacks and can be broken with modern computing power.',
    exploit: 'Attackers can: crack MD5/SHA1 hashes to reveal passwords, create fake certificates that appear legitimate, break encrypted data, or forge cryptographic signatures. MD5 and SHA1 are considered completely broken for security purposes.',
    vulnerableExample: `// DANGEROUS - Weak algorithms
import hashlib

# Never use for security!
password_hash = hashlib.md5(password).hexdigest()
password_hash = hashlib.sha1(password).hexdigest()

# Weak encryption:
from Crypto.Cipher import DES
cipher = DES.new(key, DES.MODE_ECB)`,
    fixedExample: `// SAFE - Use modern algorithms
import hashlib
import secrets

# For passwords - use bcrypt or argon2:
import bcrypt
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

# For general hashing - use SHA-256+:
password_hash = hashlib.sha256(password.encode()).hexdigest()

# For encryption - use AES-256:
from Crypto.Cipher import AES
cipher = AES.new(key, AES.MODE_GCM)

# For signatures - use ECDSA or RSA-2048+`,
    cwe: 'CWE-327: Use of Weak Cryptographic Algorithm',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html']
  },

  'sql-injection-risk': {
    id: 'sql-injection-risk',
    name: 'SQL Injection Risk',
    severity: 'high',
    category: 'SQL Injection',
    what: 'String concatenation in SQL queries allows attackers to inject malicious SQL. This is one of the most dangerous and common web vulnerabilities.',
    exploit: 'Attackers can: bypass authentication, read/insert/update/delete database contents, execute system commands (in some DBs), or crash the application. SQL injection was behind the 2017 Equifax breach affecting 147 million people.',
    vulnerableExample: `// DANGEROUS - Java SQL Injection
String query = "SELECT * FROM users WHERE id = " + userId;
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery(query);

// Also vulnerable in PHP:
$query = "SELECT * FROM users WHERE name = '" . $name . "'";
$result = mysql_query($query);`,
    fixedExample: `// SAFE - Use PreparedStatement
PreparedStatement pstmt = conn.prepareStatement(
    "SELECT * FROM users WHERE id = ?"
);
pstmt.setInt(1, userId);
ResultSet rs = pstmt.executeQuery();

// In PHP - use PDO:
$stmt = $pdo->prepare("SELECT * FROM users WHERE name = :name");
$stmt->execute(['name' => $name]);`,
    cwe: 'CWE-89: SQL Injection',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html']
  },

  'path-traversal': {
    id: 'path-traversal',
    name: 'Path Traversal',
    severity: 'high',
    category: 'Path Manipulation',
    what: 'Allowing user input to control file paths without validation lets attackers access files outside the intended directory using ".." sequences.',
    exploit: 'An attacker can use ../../etc/passwd to read system files, ../../.env to steal environment variables, or access sensitive configuration files. They can also overwrite critical system files to gain persistent access.',
    vulnerableExample: `// DANGEROUS - Path traversal vulnerability
const filePath = '/uploads/' + req.body.filename;
fs.readFile(filePath);

// Also vulnerable:
file = open(user_input, 'r')
filename = request.GET['file']`,
    fixedExample: `// SAFE - Validate and sanitize paths
import path from 'path';

const uploadsDir = '/uploads/';
const requested = path.join(uploadsDir, req.body.filename);
const resolved = path.resolve(requested);

// Ensure resolved path is within uploads directory
if (!resolved.startsWith(uploadsDir)) {
    throw new Error('Access denied');
}
fs.readFile(resolved);

// Or use a whitelist:
const allowed = ['avatar.png', 'profile.jpg'];
if (!allowed.includes(req.body.filename)) {
    throw new Error('Invalid file');
}`,
    cwe: 'CWE-22: Improper Limitation of a Pathname',
    references: ['https://owasp.org/www-community/attacks/Path_Traversal']
  },

  'xxe-injection': {
    id: 'xxe-injection',
    name: 'XML External Entity (XXE)',
    severity: 'high',
    category: 'XML Injection',
    what: 'Processing untrusted XML without disabling external entities allows attackers to access local files, perform Server-Side Request Forgery (SSRF), or denial of service attacks.',
    exploit: 'Attackers inject XML with external entity references that: read server files (like /etc/passwd), cause denial of service, scan internal networks, or execute commands in vulnerable configurations. XXE was behind many breaches including a major bank infiltration.',
    vulnerableExample: `// DANGEROUS - XXE vulnerable
import xml.etree.ElementTree as ET

# Parsing untrusted XML
tree = ET.parse(user_xml_input)
root = tree.getroot()

# Also vulnerable in Java:
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
DocumentBuilder db = dbf.newDocumentBuilder();
Document doc = db.parse(inputStream);`,
    fixedExample: `// SAFE - Disable external entities
import xml.etree.ElementTree as ET

# Disable external entities when parsing
parser = ET.XMLParser()
parser.entity = {}  # Disable entities

tree = ET.parse(user_xml_input, parser=parser)

# In Java:
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);`,
    cwe: 'CWE-611: XML External Entity Reference',
    references: ['https://owasp.org/www-community/attacks/XXE']
  },

  'ssrf': {
    id: 'ssrf',
    name: 'Server-Side Request Forgery',
    severity: 'high',
    category: 'Request Smuggling',
    what: 'Fetching URLs based on user input without validation allows attackers to make the server attack internal services, cloud metadata, or protected endpoints.',
    exploit: 'Attackers can: access cloud metadata at 169.254.169.254 (AWS/GCP/Azure), scan internal networks, attack internal services behind firewalls, or exfiltrate data through the server. This bypasses network segmentation and lets attackers use your server as a proxy.',
    vulnerableExample: `// DANGEROUS - SSRF vulnerable
const url = req.body.url;
const response = await fetch(url);

# In Python:
import requests
url = user_input
r = requests.get(url)`,
    fixedExample: `// SAFE - Validate URLs strictly
import { URL } from 'url';

function fetchResource(inputUrl) {
    const url = new URL(inputUrl);
    
    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only HTTP/HTTPS allowed');
    }
    
    // Block private IPs
    const hostname = url.hostname;
    if (isPrivateIP(hostname) || hostname === 'localhost') {
        throw new Error('Private URLs not allowed');
    }
    
    // Or use a whitelist:
    const allowedDomains = ['api.example.com', 'cdn.example.com'];
    if (!allowedDomains.includes(url.hostname)) {
        throw new Error('Domain not allowed');
    }
    
    return fetch(url);
}

function isPrivateIP(hostname) {
    // Check if hostname resolves to private IP
    const dns = require('dns');
    // ... implement proper check
}`,
    cwe: 'CWE-918: Server-Side Request Forgery',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html']
  },

  'nosqli': {
    id: 'nosqli',
    name: 'NoSQL Injection',
    severity: 'high',
    category: 'Injection',
    what: 'Passing user input directly to NoSQL queries (like MongoDB) without sanitization allows attackers to inject operators that bypass authentication or extract data.',
    exploit: 'Attackers send specially crafted objects instead of strings. For example, {"$ne": null} can match any value, or operators like $where, $func can execute JavaScript on the database server. This can bypass login, extract all users, or execute code.',
    vulnerableExample: `// DANGEROUS - NoSQL injection
const query = { username: req.body.username, password: req.body.password };
db.users.find(query);

# Also vulnerable in Python:
user = db.users.find_one({
    "username": username,
    "password": password
})`,
    fixedExample: `// SAFE - Validate and sanitize input
import mongoose from 'mongoose';
import Joi from 'joi';

// Validate input schema first
const schema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required()
});

const { error, value } = schema.validate(req.body);
if (error) throw new Error('Invalid input');

// Use validated values
const query = { username: value.username, password: value.password };
db.users.find(query);

// Or use type coercion prevention:
const query = { 
    username: String(req.body.username),
    password: String(req.body.password)
};`,
    cwe: 'CWE-943: Improper Neutralization of Special Elements in Data Query Logic',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html']
  },

  'jwt-none-algorithm': {
    id: 'jwt-none-algorithm',
    name: 'JWT None Algorithm',
    severity: 'critical',
    category: 'Authentication',
    what: 'Accepting JWTs with alg: none or failing to validate the algorithm allows attackers to forge tokens by removing the signature. Some libraries also allow algorithm confusion attacks.',
    exploit: 'Attackers create a token with alg: none, remove the signature, and present it as a valid token. They can impersonate any user (including admins), bypass authentication entirely, or escalate privileges. This is one of the most critical JWT vulnerabilities.',
    vulnerableExample: `// DANGEROUS - JWT vulnerabilities
const jwt = require('jsonwebtoken');

const token = jwt.decode(userToken);
// Never use decode without verify!

// Also problematic:
jwt.verify(token, secret, { algorithms: ['HS256', 'RS256', 'none'] })
// Accepting 'none' is dangerous`,
    fixedExample: `// SAFE - Explicitly specify algorithms
const jwt = require('jsonwebtoken');

// Always specify allowed algorithms - never use 'none'
const token = jwt.verify(userToken, secret, {
    algorithms: ['HS256']  // Only allow HS256
});

// For RS256, use public key:
jwt.verify(token, publicKey, {
    algorithms: ['RS256']
});

// Verify algorithm in token matches expected:
const decoded = jwt.decode(token, { complete: true });
if (decoded.header.alg !== 'HS256') {
    throw new Error('Unexpected algorithm');
}`,
    cwe: 'CWE-347: Improper Verification of Cryptographic Signature',
    references: ['https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/']
  },

  'insecure-randomness': {
    id: 'insecure-randomness',
    name: 'Insecure Randomness',
    severity: 'medium',
    category: 'Cryptographic Issues',
    what: 'Using Math.random() or similar predictable random functions for security-sensitive operations like generating tokens, passwords, or session IDs.',
    exploit: 'Math.random() is not cryptographically secure. Attackers can predict or guess the random values, allowing them to: guess session IDs and hijack sessions, predict password reset tokens, brute-force verification codes, or predict API keys.',
    vulnerableExample: `// DANGEROUS - Predictable randomness
const sessionId = Math.random().toString(36);
const token = Math.random().toString(36).substring(2);

// Python - also predictable:
import random
token = random.randint(0, 1000000)
reset_code = str(random.random())[2:8]`,
    fixedExample: `// SAFE - Use crypto.random
const crypto = require('crypto');

// For tokens and secrets:
const token = crypto.randomBytes(32).toString('hex');

// For verification codes:
const code = crypto.randomInt(100000, 999999).toString();

// In Python:
import secrets
token = secrets.token_hex(32)
code = secrets.randbelow(900000) + 100000

// In Go:
import "crypto/rand"
b := make([]byte, 32)
rand.Read(b)`,
    cwe: 'CWE-338: Use of Cryptographically Weak Pseudo-Random Number Generator',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html']
  },

  'csrf-missing': {
    id: 'csrf-missing',
    name: 'Missing CSRF Protection',
    severity: 'medium',
    category: 'Authentication',
    what: 'State-changing operations (POST, PUT, DELETE) lack Cross-Site Request Forgery protection, allowing attackers to trick users into performing actions without their consent.',
    exploit: 'An attacker embeds a malicious form or script on another site that submits requests to your application. When a logged-in user visits the attackers site, their browser automatically sends the request with their cookies. The user unknowingly: changes password, transfers money, deletes data, or modifies settings.',
    vulnerableExample: `// DANGEROUS - No CSRF protection
app.post('/transfer', (req, res) => {
    // Transfer money without CSRF check
    const amount = req.body.amount;
    const to = req.body.to;
    transferMoney(req.session.user, to, amount);
});

// Form has no CSRF token:
<form action="/transfer" method="POST">
    <input name="amount" />
    <input name="to" />
    <button>Transfer</button>
</form>`,
    fixedExample: `// SAFE - Use CSRF tokens
import csrf from 'csurf';
const csrfProtection = csrf({ cookie: true });

// Generate token server-side
app.get('/form', csrfProtection, (req, res) => {
    res.render('form', { csrfToken: req.csrfToken() });
});

// Verify on submit
app.post('/transfer', csrfProtection, (req, res) => {
    // Now protected against CSRF
    transferMoney(req.session.user, req.body.to, req.body.amount);
});

// In HTML form:
<form action="/transfer" method="POST">
    <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
    ...
</form>

// Or use SameSite cookies:
res.cookie('session', token, { sameSite: 'strict' });`,
    cwe: 'CWE-352: Cross-Site Request Forgery',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html']
  },

  'open-redirect': {
    id: 'open-redirect',
    name: 'Open Redirect',
    severity: 'medium',
    category: 'URL Redirection',
    what: 'Using user-controlled input in redirect URLs without validation allows attackers to redirect users to malicious sites, which is used in phishing attacks.',
    exploit: 'Attackers send links to your site with a malicious redirect: yoursite.com/login?next=https://evil.com. Users trust links from your domain, so they will click thinking they are staying on your site. They then land on a perfect clone of your login page (phishing) or a malware site.',
    vulnerableExample: `// DANGEROUS - Open redirect
const redirectUrl = req.query.url;
res.redirect(redirectUrl);

// Or:
res.redirect('/' + req.body.path);

// Also vulnerable:
<a href="<%= url %>">Click here</a>`,
    fixedExample: `// SAFE - Validate redirect URLs
function isValidRedirectUrl(url) {
    try {
        const parsed = new URL(url);
        // Only allow relative URLs or specific domains
        if (parsed.origin !== 'https://yoursite.com') {
            // If absolute, must be from allowed list
            return allowedDomains.includes(parsed.hostname);
        }
        return true;
    } catch {
        return false;
    }
}

// Use validated URL
if (isValidRedirectUrl(redirectUrl)) {
    res.redirect(redirectUrl);
} else {
    res.redirect('/'); // Safe default
}

// Or use path-only redirects:
if (url.startsWith('/')) {
    res.redirect(url); // Only allow relative
}`,
    cwe: 'CWE-601: URL Redirection to Untrusted Site',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html']
  },

  'mass-assignment': {
    id: 'mass-assignment',
    name: 'Mass Assignment',
    severity: 'medium',
    category: 'Access Control',
    what: 'Binding client data directly to model objects without allowlisting fields lets attackers modify protected attributes like roles, permissions, or admin status.',
    exploit: 'Attackers inspect your API and find hidden fields. They submit additional parameters like role=admin, isAdmin=true, or price=0. Since these are not in your form but are in your model, they get set automatically, granting unauthorized access or privileges.',
    vulnerableExample: `// DANGEROUS - Mass assignment
const user = new User(req.body);
user.save();

// Or in Rails:
@user = User.new(params[:user])

// Attacker adds to form:
<input type="hidden" name="user[admin]" value="true" />
<input type="hidden" name="user[role]" value="admin" />`,
    fixedExample: `// SAFE - Explicit attribute allowlisting
const user = new User({
    username: req.body.username,
    email: req.body.email,
    // Explicitly list allowed fields
});
user.save();

// In Node with Sequelize:
const { User } = require('./models');
const user = await User.create({
    username: req.body.username,
    email: req.body.email,
    // Don't include role, isAdmin, etc.
});

// Use validation library:
const schema = Joi.object({
    username: Joi.string().alphanum().required(),
    email: Joi.string().email().required()
    // No role field allowed
});
const data = schema.validate(req.body);`,
    cwe: 'CWE-915: Improperly Controlled Modification of Dynamically-Determined Object Attributes',
    references: ['https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html']
  },

  'template-injection': {
    id: 'template-injection',
    name: 'Server-Side Template Injection',
    severity: 'critical',
    category: 'Code Injection',
    what: 'Rendering user input in templates without sandboxing allows attackers to execute arbitrary code on the server by injecting template expressions.',
    exploit: 'Attackants inject template syntax (like {{7*7}} in Jinja2 or ${7*7} in FreeMarker). If the template engine evaluates this, they can: read files, execute commands, or fully compromise the server.',
    vulnerableExample: `// DANGEROUS - SSTI vulnerable
// Jinja2 (Python/Flask)
template = f"Hello {user_input}"
rendered = Jinja2.render_string(template, request)

// In Java with Freemarker:
Template t = cfg.getTemplate(userInput);
t.process(dataModel, out);

// Node with Handlebars:
const template = Handlebars.compile(userInput);
template(data);`,
    fixedExample: `// SAFE - Separate code from data
// Jinja2 - use a template, not string interpolation
template = env.get_template('greeting.html')
rendered = template.render(name=user_input)

# If you must accept templates, use a sandbox:
from markupsafe import escape
safe_input = escape(user_input)
template = f"Hello {safe_input}"

// In Node - never compile user input directly:
// DON'T do this: Handlebars.compile(userInput)

// Use a pre-defined template:
const template = Handlebars.compile('Hello {{name}}');
template({ name: userInput });`,
    cwe: 'CWE-94: Code Injection',
    references: ['https://portswigger.net/web-security/server-side-template-injection']
  }
};

export function getVulnerabilityExplanation(ruleId) {
  return vulnerabilityKnowledgeBase[ruleId] || null;
}

export function searchVulnerabilities(query) {
  const q = query.toLowerCase();
  return Object.values(vulnerabilityKnowledgeBase).filter(v =>
    v.name.toLowerCase().includes(q) ||
    v.category.toLowerCase().includes(q) ||
    v.what.toLowerCase().includes(q)
  );
}

export function getAllVulnerabilities() {
  return Object.values(vulnerabilityKnowledgeBase);
}
