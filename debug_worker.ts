import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { processEvaluationBatch } from './src/lib/evaluation-worker.server';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!, 
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
  const { data: run } = await supabase.from('evaluation_runs').select('id, status').eq('status', 'running').order('created_at', { ascending: false }).limit(1).single();
  if (!run) {
    console.log("No running evaluation found.");
    return;
  }
  
  console.log(`Auditing run: ${run.id} (${run.status})`);
  
  const { data: results } = await supabase.from('evaluation_results').select('id, status').eq('run_id', run.id);
  console.log(`Found ${results?.length} result slots.`);
  console.log(`Pending slots: ${results?.filter(r => r.status === 'pending').length}`);
  
  try {
    const batch = await processEvaluationBatch(run.id, 1);
    console.log("Batch result:", batch);
  } catch (e) {
    console.error("Worker crash:", e);
  }
}
run();
