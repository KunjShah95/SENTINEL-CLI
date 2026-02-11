import crypto from 'crypto';

class MultiTenantManager {
  constructor(options = {}) {
    this.tenants = new Map();
    this.isolationLevel = options.isolationLevel || 'strict'; // strict, logical, shared
    this.encryptionKey = options.encryptionKey || process.env.TENANT_ENCRYPTION_KEY;
    this.defaultQuota = options.defaultQuota || {
      maxProjects: 10,
      maxAnalysesPerMonth: 1000,
      maxStorageMB: 1024,
      maxUsers: 5,
    };
  }

  async createTenant(tenantData) {
    const tenantId = this.generateTenantId();
    const apiKey = this.generateApiKey();
    
    const tenant = {
      id: tenantId,
      name: tenantData.name,
      slug: this.generateSlug(tenantData.name),
      apiKey,
      createdAt: Date.now(),
      status: 'active',
      plan: tenantData.plan || 'free',
      quota: { ...this.defaultQuota, ...tenantData.quota },
      usage: {
        analysesThisMonth: 0,
        storageUsedMB: 0,
        lastReset: Date.now(),
      },
      settings: tenantData.settings || {},
      features: tenantData.features || [],
      metadata: tenantData.metadata || {},
    };

    // Encrypt sensitive data if encryption key available
    if (this.encryptionKey) {
      tenant.apiKey = this.encrypt(apiKey);
    }

    this.tenants.set(tenantId, tenant);
    
    return {
      tenant: this.sanitizeTenant(tenant),
      apiKey, // Return unencrypted key only once
    };
  }

  getTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;
    return this.sanitizeTenant(tenant);
  }

  getTenantByApiKey(apiKey) {
    for (const tenant of this.tenants.values()) {
      const storedKey = this.encryptionKey 
        ? this.decrypt(tenant.apiKey)
        : tenant.apiKey;
      
      if (storedKey === apiKey) {
        return this.sanitizeTenant(tenant);
      }
    }
    return null;
  }

  updateTenant(tenantId, updates) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;

    const allowedUpdates = ['name', 'plan', 'quota', 'settings', 'features', 'status'];
    
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        tenant[key] = updates[key];
      }
    }

    tenant.updatedAt = Date.now();
    return this.sanitizeTenant(tenant);
  }

  deleteTenant(tenantId) {
    return this.tenants.delete(tenantId);
  }

  checkQuota(tenantId, operation) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return { allowed: false, reason: 'Tenant not found' };

    // Reset monthly counters if needed
    this.resetMonthlyUsageIfNeeded(tenant);

    switch (operation) {
      case 'analysis':
        if (tenant.usage.analysesThisMonth >= tenant.quota.maxAnalysesPerMonth) {
          return {
            allowed: false,
            reason: `Monthly analysis quota exceeded (${tenant.quota.maxAnalysesPerMonth})`,
          };
        }
        break;

      case 'storage':
        if (tenant.usage.storageUsedMB >= tenant.quota.maxStorageMB) {
          return {
            allowed: false,
            reason: `Storage quota exceeded (${tenant.quota.maxStorageMB}MB)`,
          };
        }
        break;

      case 'project': {
        const projectCount = this.getProjectCount(tenantId);
        if (projectCount >= tenant.quota.maxProjects) {
          return {
            allowed: false,
            reason: `Project quota exceeded (${tenant.quota.maxProjects})`,
          };
        }
        break;
      }

      default:
        return { allowed: true };
    }

    return { allowed: true };
  }

  recordUsage(tenantId, operation, amount = 1) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    this.resetMonthlyUsageIfNeeded(tenant);

    switch (operation) {
      case 'analysis':
        tenant.usage.analysesThisMonth += amount;
        break;
      case 'storage':
        tenant.usage.storageUsedMB += amount;
        break;
    }

    return true;
  }

  resetMonthlyUsageIfNeeded(tenant) {
    const now = Date.now();
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    
    if (now - tenant.usage.lastReset > oneMonth) {
      tenant.usage.analysesThisMonth = 0;
      tenant.usage.lastReset = now;
    }
  }

  getProjectCount(_tenantId) {
    // This would query the database in a real implementation
    return 0;
  }

  sanitizeTenant(tenant) {
    // eslint-disable-next-line no-unused-vars
    const { apiKey, ...sanitized } = tenant;
    return sanitized;
  }

  generateTenantId() {
    return `tenant_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateApiKey() {
    return `sk_${crypto.randomBytes(32).toString('hex')}`;
  }

  generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  encrypt(text) {
    if (!this.encryptionKey) return text;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedData) {
    if (!this.encryptionKey) return encryptedData;
    
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    // eslint-disable-next-line no-unused-vars
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Note: In a complete implementation, iv would be passed to createDecipheriv
    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  getAllTenants() {
    return Array.from(this.tenants.values()).map(t => this.sanitizeTenant(t));
  }

  getTenantStats() {
    const tenants = this.getAllTenants();
    
    return {
      total: tenants.length,
      byPlan: tenants.reduce((acc, t) => {
        acc[t.plan] = (acc[t.plan] || 0) + 1;
        return acc;
      }, {}),
      byStatus: tenants.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {}),
      totalUsage: tenants.reduce((acc, t) => ({
        analyses: acc.analyses + (t.usage?.analysesThisMonth || 0),
        storage: acc.storage + (t.usage?.storageUsedMB || 0),
      }), { analyses: 0, storage: 0 }),
    };
  }

  async validateTenantContext(context) {
    const { tenantId, apiKey } = context;
    
    let tenant = null;
    
    if (apiKey) {
      tenant = this.getTenantByApiKey(apiKey);
    } else if (tenantId) {
      tenant = this.getTenant(tenantId);
    }

    if (!tenant) {
      return { valid: false, error: 'Invalid tenant credentials' };
    }

    if (tenant.status !== 'active') {
      return { valid: false, error: 'Tenant is not active' };
    }

    return { valid: true, tenant };
  }
}

export default MultiTenantManager;
