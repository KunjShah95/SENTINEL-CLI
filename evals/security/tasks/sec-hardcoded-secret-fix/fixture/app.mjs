import { getConfig } from './config.js';

const cfg = getConfig();
if (!cfg || typeof cfg.apiKey !== 'string') {
  console.error('missing apiKey');
  process.exit(1);
}
console.log('config ok');
