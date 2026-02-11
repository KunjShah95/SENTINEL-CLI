import crypto from 'crypto';
// import { promisify } from 'util';

class AuthenticationManager {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || this.generateSecret();
    this.jwtExpiresIn = options.jwtExpiresIn || '24h';
    this.refreshTokenExpiresIn = options.refreshTokenExpiresIn || '7d';
    this.providers = new Map();
    this.sessions = new Map();
    this.users = new Map();
    this.failedAttempts = new Map();
    this.maxFailedAttempts = options.maxFailedAttempts || 5;
    this.lockoutDuration = options.lockoutDuration || 15 * 60 * 1000; // 15 minutes
  }

  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  // JWT Authentication
  async generateTokens(user) {
    const jwt = await import('jsonwebtoken');
    
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role || 'user',
      tenantId: user.tenantId,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: this.refreshTokenExpiresIn }
    );

    // Store session
    const sessionId = crypto.randomBytes(16).toString('hex');
    this.sessions.set(sessionId, {
      userId: user.id,
      refreshToken,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.jwtExpiresIn,
      sessionId,
    };
  }

  async verifyToken(token) {
    try {
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.verify(token, this.jwtSecret);
      return { valid: true, user: decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.verify(refreshToken, this.jwtSecret);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const user = this.users.get(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      return { error: error.message };
    }
  }

  // User Management
  async createUser(userData) {
    const userId = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const user = {
      id: userId,
      email: userData.email,
      passwordHash: await this.hashPassword(userData.password),
      name: userData.name,
      role: userData.role || 'user',
      tenantId: userData.tenantId,
      createdAt: Date.now(),
      lastLogin: null,
      mfaEnabled: false,
      status: 'active',
    };

    this.users.set(userId, user);
    
    return this.sanitizeUser(user);
  }

  async authenticateUser(email, password) {
    // Check for lockout
    const lockKey = `login:${email}`;
    const failedAttempts = this.failedAttempts.get(lockKey) || 0;
    
    if (failedAttempts >= this.maxFailedAttempts) {
      return { success: false, error: 'Account locked. Please try again later.' };
    }

    // Find user
    const user = Array.from(this.users.values()).find(u => u.email === email);
    
    if (!user) {
      this.recordFailedAttempt(lockKey);
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.status !== 'active') {
      return { success: false, error: 'Account is not active' };
    }

    // Verify password
    const isValid = await this.verifyPassword(password, user.passwordHash);
    
    if (!isValid) {
      this.recordFailedAttempt(lockKey);
      return { success: false, error: 'Invalid credentials' };
    }

    // Clear failed attempts
    this.failedAttempts.delete(lockKey);

    // Update last login
    user.lastLogin = Date.now();

    // Generate tokens
    const tokens = await this.generateTokens(user);
    
    return {
      success: true,
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  recordFailedAttempt(key) {
    const current = this.failedAttempts.get(key) || 0;
    this.failedAttempts.set(key, current + 1);
    
    // Auto-clear after lockout duration
    setTimeout(() => {
      this.failedAttempts.delete(key);
    }, this.lockoutDuration);
  }

  async hashPassword(password) {
    const bcrypt = await import('bcryptjs');
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  async verifyPassword(password, hash) {
    const bcrypt = await import('bcryptjs');
    return bcrypt.compare(password, hash);
  }

  // OAuth Provider Integration
  registerOAuthProvider(name, config) {
    this.providers.set(name, config);
  }

  async initiateOAuth(providerName, redirectUri) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    const state = crypto.randomBytes(32).toString('hex');
    
    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: provider.scope || 'openid email profile',
      state,
    });

    return {
      authorizationUrl: `${provider.authorizationEndpoint}?${params.toString()}`,
      state,
    };
  }

  async handleOAuthCallback(providerName, code, redirectUri) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    // Exchange code for token
    const tokenResponse = await fetch(provider.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      }),
    });

    const tokens = await tokenResponse.json();
    
    // Get user info
    const userInfoResponse = await fetch(provider.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo = await userInfoResponse.json();

    // Find or create user
    let user = Array.from(this.users.values()).find(
      u => u.email === userInfo.email
    );

    if (!user) {
      user = await this.createUser({
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        password: crypto.randomBytes(32).toString('hex'), // Random password
      });
    }

    // Generate our tokens
    const authTokens = await this.generateTokens(user);
    
    return {
      user: this.sanitizeUser(user),
      ...authTokens,
      provider: providerName,
    };
  }

  // SAML SSO
  async generateSAMLRequest(idpConfig) {
    const { default: saml } = await import('samlify');
    
    const sp = saml.ServiceProvider({
      entityID: idpConfig.spEntityId,
      assertionConsumerService: [{
        Binding: saml.Constants.namespace.binding.post,
        Location: idpConfig.callbackUrl,
      }],
    });

    const idp = saml.IdentityProvider({
      entityID: idpConfig.entityId,
      singleSignOnService: [{
        Binding: saml.Constants.namespace.binding.post,
        Location: idpConfig.ssoUrl,
      }],
      signingCert: idpConfig.certificate,
    });

    const { id, context } = sp.createLoginRequest(idp, 'redirect');
    
    return {
      requestId: id,
      samlRequest: context,
    };
  }

  async handleSAMLResponse(samlResponse, idpConfig) {
    const { default: saml } = await import('samlify');
    
    const sp = saml.ServiceProvider({
      entityID: idpConfig.spEntityId,
    });

    const idp = saml.IdentityProvider({
      entityID: idpConfig.entityId,
      signingCert: idpConfig.certificate,
    });

    const { extract } = await sp.parseLoginResponse(idp, 'post', {
      body: { SAMLResponse: samlResponse },
    });

    // Find or create user
    let user = Array.from(this.users.values()).find(
      u => u.email === extract.attributes.email
    );

    if (!user) {
      user = await this.createUser({
        email: extract.attributes.email,
        name: extract.attributes.name || extract.attributes.email,
        password: crypto.randomBytes(32).toString('hex'),
      });
    }

    const tokens = await this.generateTokens(user);
    
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // MFA Support
  async setupMFA(userId) {
    const speakeasy = await import('speakeasy');
    
    const secret = speakeasy.generateSecret({
      name: `Sentinel:${userId}`,
    });

    const user = this.users.get(userId);
    if (user) {
      user.mfaSecret = secret.base32;
      user.mfaEnabled = false; // Pending verification
    }

    return {
      secret: secret.base32,
      qrCodeUrl: secret.otpauth_url,
    };
  }

  async verifyMFA(userId, token) {
    const speakeasy = await import('speakeasy');
    
    const user = this.users.get(userId);
    if (!user || !user.mfaSecret) {
      return false;
    }

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (verified && !user.mfaEnabled) {
      user.mfaEnabled = true;
    }

    return verified;
  }

  // Session Management
  async logout(sessionId) {
    this.sessions.delete(sessionId);
    return true;
  }

  async logoutAll(userId) {
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
      }
    }
    return true;
  }

  getActiveSessions(userId) {
    const sessions = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId) {
        sessions.push({
          sessionId,
          createdAt: session.createdAt,
          lastUsed: session.lastUsed,
        });
      }
    }
    return sessions;
  }

  // Helper Methods
  sanitizeUser(user) {
    // eslint-disable-next-line no-unused-vars
    const { passwordHash, mfaSecret, ...sanitized } = user;
    return sanitized;
  }

  getStats() {
    return {
      totalUsers: this.users.size,
      activeSessions: this.sessions.size,
      oauthProviders: this.providers.size,
      failedAttempts: this.failedAttempts.size,
    };
  }
}

export default AuthenticationManager;
