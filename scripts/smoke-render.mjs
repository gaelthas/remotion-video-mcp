import {ROOT, ensureDirs} from '../server/paths.mjs';
import * as jm from '../server/job-manager.mjs';

ensureDirs();
console.log(`runtime root: ${ROOT}`);
const jobId = await jm.enqueue('smoke', {});
console.log(`smoke job: ${jobId}`);
const final = await jm.waitForJob(jobId);
const result = jm.readResult(jobId);
if (final.state !== 'done' || !result?.ok) {
  console.error('冒烟渲染失败：', JSON.stringify(result?.error ?? final.error, null, 2));
  console.error(jm.readLog(jobId, 120).join('\n'));
  process.exit(1);
}
console.log('冒烟渲染通过：', JSON.stringify(result.result, null, 2));
