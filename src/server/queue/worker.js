import { Worker, Queue } from 'bullmq';
import { getLogger } from '../../utils/structuredLogger.js';
import { getLanguageAgent } from '../../agents/languageAgents.js';
import { RAGPipeline } from '../../rag/ragPipeline.js';

const workerLogger = getLogger().child({ service: 'background-worker' });

// Connection options for Redis
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const toolQueue = new Queue('sentinel-tools', { connection });

workerLogger.info('Background worker queue initialized');

// Background worker to handle heavy processing out-of-band from the main Hono/Express loop
export const worker = new Worker('sentinel-tools', async job => {
  workerLogger.info(`Processing job ${job.id}: ${job.name}`);

  if (job.name === 'index_codebase') {
    const { projectPath } = job.data;
    const pipeline = new RAGPipeline();
    await pipeline.initialize();

    // Perform heavy indexing
    const result = await pipeline.indexCodebase(projectPath);
    return result;
  }

  if (job.name === 'ast_analysis') {
    const { code, language } = job.data;
    const agent = await getLanguageAgent(language);
    const analysis = await agent.analyze(code);
    return analysis;
  }

  throw new Error(`Unknown job type: ${job.name}`);
}, { connection });

worker.on('completed', job => {
  workerLogger.info(`Job ${job.id} has completed`);
});

worker.on('failed', (job, err) => {
  workerLogger.error(`Job ${job.id} failed`, { err });
});
