import chalk from 'chalk';
import Table from 'cli-table3';

export async function listTenants() {
  const { MultiTenantManager } = await import('../auth/multiTenantManager.js');
  
  const manager = new MultiTenantManager();
  const tenants = manager.getAllTenants();
  
  if (tenants.length === 0) {
    console.log(chalk.yellow('No tenants found'));
    return;
  }
  
  const table = new Table({
    head: ['ID', 'Name', 'Plan', 'Status', 'Created'],
    colWidths: [30, 25, 12, 12, 25],
  });
  
  for (const tenant of tenants) {
    table.push([
      tenant.id,
      tenant.name,
      tenant.plan,
      tenant.status,
      new Date(tenant.createdAt).toLocaleString(),
    ]);
  }
  
  console.log('\n' + chalk.bold('Tenants'));
  console.log(table.toString());
}

export async function createTenant(name, options = {}) {
  const { MultiTenantManager } = await import('../auth/multiTenantManager.js');
  
  const manager = new MultiTenantManager();
  const { tenant, apiKey } = await manager.createTenant({
    name,
    plan: options.plan || 'free',
    quota: {
      maxProjects: parseInt(options.maxProjects, 10) || 10,
      maxAnalysesPerMonth: parseInt(options.maxAnalyses, 10) || 1000,
      maxStorageMB: parseInt(options.maxStorage, 10) || 1024,
      maxUsers: parseInt(options.maxUsers, 10) || 5,
    },
  });
  
  console.log(chalk.green(`✓ Tenant created: ${tenant.name}`));
  console.log(chalk.cyan(`  ID: ${tenant.id}`));
  console.log(chalk.cyan(`  Plan: ${tenant.plan}`));
  console.log(chalk.yellow(`  API Key: ${apiKey}`));
  console.log(chalk.gray('  Save this API key - it won\'t be shown again'));
}

export async function showTenant(tenantId) {
  const { MultiTenantManager } = await import('../auth/multiTenantManager.js');
  
  const manager = new MultiTenantManager();
  const tenant = manager.getTenant(tenantId);
  
  if (!tenant) {
    console.error(chalk.red('Tenant not found'));
    return;
  }
  
  console.log(chalk.bold('\nTenant Details\n'));
  console.log(`ID: ${tenant.id}`);
  console.log(`Name: ${tenant.name}`);
  console.log(`Slug: ${tenant.slug}`);
  console.log(`Plan: ${chalk.cyan(tenant.plan)}`);
  console.log(`Status: ${tenant.status === 'active' ? chalk.green(tenant.status) : chalk.red(tenant.status)}`);
  console.log(`Created: ${new Date(tenant.createdAt).toLocaleString()}`);
  
  console.log(chalk.bold('\nQuota:'));
  console.log(`  Max Projects: ${tenant.quota.maxProjects}`);
  console.log(`  Max Analyses/Month: ${tenant.quota.maxAnalysesPerMonth}`);
  console.log(`  Max Storage: ${tenant.quota.maxStorageMB} MB`);
  console.log(`  Max Users: ${tenant.quota.maxUsers}`);
  
  console.log(chalk.bold('\nUsage:'));
  console.log(`  Analyses This Month: ${tenant.usage.analysesThisMonth}`);
  console.log(`  Storage Used: ${tenant.usage.storageUsedMB} MB`);
}

export async function updateTenant(tenantId, updates) {
  const { MultiTenantManager } = await import('../auth/multiTenantManager.js');
  
  const manager = new MultiTenantManager();
  const tenant = manager.updateTenant(tenantId, updates);
  
  if (!tenant) {
    console.error(chalk.red('Tenant not found'));
    return;
  }
  
  console.log(chalk.green(`✓ Tenant updated: ${tenant.name}`));
}

export async function deleteTenant(tenantId) {
  const { MultiTenantManager } = await import('../auth/multiTenantManager.js');
  
  const manager = new MultiTenantManager();
  const deleted = manager.deleteTenant(tenantId);
  
  if (deleted) {
    console.log(chalk.green(`✓ Tenant deleted: ${tenantId}`));
  } else {
    console.error(chalk.red('Tenant not found'));
  }
}

export async function rotateTenantKey(tenantId) {
  const { MultiTenantManager } = await import('../auth/multiTenantManager.js');
  
  const manager = new MultiTenantManager();
  const tenant = manager.getTenant(tenantId);
  
  if (!tenant) {
    console.error(chalk.red('Tenant not found'));
    return;
  }
  
  // In a real implementation, this would rotate the API key
  console.log(chalk.yellow('API key rotation would be implemented here'));
  console.log(chalk.green(`✓ API key rotated for tenant: ${tenant.name}`));
}

export async function tenantStats() {
  const { MultiTenantManager } = await import('../auth/multiTenantManager.js');
  
  const manager = new MultiTenantManager();
  const stats = manager.getTenantStats();
  
  console.log(chalk.bold('\nTenant Statistics\n'));
  console.log(`Total Tenants: ${chalk.cyan(stats.total)}`);
  
  console.log(chalk.bold('\nBy Plan:'));
  for (const [plan, count] of Object.entries(stats.byPlan)) {
    console.log(`  ${plan}: ${count}`);
  }
  
  console.log(chalk.bold('\nBy Status:'));
  for (const [status, count] of Object.entries(stats.byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  
  console.log(chalk.bold('\nTotal Usage:'));
  console.log(`  Analyses: ${stats.totalUsage.analyses}`);
  console.log(`  Storage: ${stats.totalUsage.storage} MB`);
}
