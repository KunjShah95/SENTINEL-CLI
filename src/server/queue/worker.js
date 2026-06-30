import { Worker, Queue } from 'bullmq';
import { getLanguageAgent } from '../../agents/languageAgents.js';
import { RAGPipeline } from '../../rag/ragPipeline.js';

// Connection options for Redis
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const toolQueue = new Queue('sentinel-tools', { connection });

console.log('👷 Background worker queue initialized');

// Background worker to handle heavy processing out-of-band from the main Hono/Express loop
export const worker = new Worker('sentinel-tools', async job => {
  console.log(`Processing job ${job.id}: ${job.name}`);

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
  console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} has failed with ${err.message}`);
});
