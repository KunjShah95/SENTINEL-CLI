import { ShellExecutor } from '../utils/shellExecutor.js';
import FileOperations from '../utils/fileOperations.js';

export class DatabaseTools {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.shell = new ShellExecutor({ cwd: this.projectPath });
    this.files = new FileOperations(this.projectPath);
  }

  async detectDatabase() {
    const pkgPath = `${this.projectPath}/package.json`;
    const hasPkg = await this.files.exists(pkgPath);
    
    if (hasPkg) {
      const pkg = await this.files.read(pkgPath);
      const json = JSON.parse(pkg.content);
      const deps = { ...json.dependencies, ...json.devDependencies };
      
      if (deps.prisma) return { type: 'prisma', name: 'Prisma' };
      if (deps.typeorm) return { type: 'typeorm', name: 'TypeORM' };
      if (deps.sequelize) return { type: 'sequelize', name: 'Sequelize' };
      if (deps.mongoose) return { type: 'mongoose', name: 'MongoDB/Mongoose' };
      if (deps.pg) return { type: 'pg', name: 'PostgreSQL' };
      if (deps.mysql2) return { type: 'mysql', name: 'MySQL' };
      if (deps.sqlite3) return { type: 'sqlite', name: 'SQLite' };
      if (deps['@prisma/client']) return { type: 'prisma', name: 'Prisma' };
    }

    const envPath = `${this.projectPath}/.env`;
    const hasEnv = await this.files.exists(envPath);
    
    if (hasEnv) {
      const env = await this.files.read(envPath);
      const content = env.content;
      
      if (content.includes('DATABASE_URL') && content.includes('postgres')) {
        return { type: 'postgresql', name: 'PostgreSQL' };
      }
      if (content.includes('MONGO_URI') || content.includes('MONGODB')) {
        return { type: 'mongodb', name: 'MongoDB' };
      }
      if (content.includes('mysql')) {
        return { type: 'mysql', name: 'MySQL' };
      }
    }

    return { type: 'unknown', name: 'None detected' };
  }

  async runMigrations(dbType, _direction = 'up') {
    const commands = {
      prisma: `npx prisma migrate dev --name init`,
      typeorm: `npx typeorm migration:run`,
      sequelize: `npx sequelize-cli db:migrate`,
      knex: `npx knex migrate:latest`,
      default: `npm run migrate`
    };

    const cmd = commands[dbType] || commands.default;
    return await this.shell.exec(cmd);
  }

  async generateMigration(name, dbType) {
    const commands = {
      prisma: `npx prisma migrate dev --name ${name}`,
      typeorm: `npx typeorm migration:generate -n ${name}`,
      sequelize: `npx sequelize-cli migration:generate --name ${name}`,
      knex: `npx knex migrate:make ${name}`,
      default: `echo "Add migration: ${name}"`
    };

    const cmd = commands[dbType] || commands.default;
    return await this.shell.exec(cmd);
  }

  async rollbackMigration(dbType) {
    const commands = {
      prisma: `npx prisma migrate reset`,
      typeorm: `npx typeorm migration:revert`,
      sequelize: `npx sequelize-cli db:migrate:undo`,
      knex: `npx knex migrate:rollback`,
      default: `npm run migrate:rollback`
    };

    const cmd = commands[dbType] || commands.default;
    return await this.shell.exec(cmd);
  }

  async seedDatabase(dbType) {
    const commands = {
      prisma: `npx prisma db seed`,
      typeorm: `npx typeorm seeder:run`,
      sequelize: `npx sequelize-cli db:seed:all`,
      knex: `npx knex seed:run`,
      default: `npm run seed`
    };

    const cmd = commands[dbType] || commands.default;
    return await this.shell.exec(cmd);
  }

  async resetDatabase(dbType) {
    const commands = {
      prisma: `npx prisma migrate reset --force`,
      typeorm: `npx typeorm schema:sync`,
      sequelize: `npx sequelize-cli db:drop && npx sequelize-cli db:create`,
      default: `echo "Manual reset required"`
    };

    const cmd = commands[dbType] || commands.default;
    return await this.shell.exec(cmd);
  }

  async studio(dbType) {
    const commands = {
      prisma: `npx prisma studio`,
      typeorm: `echo "Use TypeORM Studio or TablePlus"`,
      sequelize: `echo "Use TablePlus or MySQL Workbench"`,
      default: `echo "No studio available"`
    };

    const cmd = commands[dbType] || commands.default;
    return await this.shell.exec(cmd);
  }

  async generateSchema(dbType) {
    const commands = {
      prisma: `npx prisma generate`,
      typeorm: `npx typeorm schema:sync`,
      default: `echo "Generate schema manually"`
    };

    const cmd = commands[dbType] || commands.default;
    return await this.shell.exec(cmd);
  }

  async getDbStatus() {
    const db = await this.detectDatabase();
    return {
      detected: db,
      migrations: 'Run "sentinel db status" for details',
      commands: {
        migrate: 'Run database migrations',
        seed: 'Seed the database',
        reset: 'Reset the database',
        studio: 'Open database GUI'
      }
    };
  }
}

export default DatabaseTools;
