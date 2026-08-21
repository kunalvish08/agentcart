import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { buildDataset, DATASET_SEED, DATASET_VERSION, PROMPT_VERSION } from './src/lib/evaluation-dataset';
import { processEvaluationBatch } from './src/lib/evaluation-worker.server';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const { data: merchant } = await supabase.from('merchants').select('id').eq('slug', 'technova-store').single();
  if (!merchant) {
    console.error("TechNova not found after seeding!");
    return;
  }
  
  const merchantId = merchant.id;
  const scenarios = buildDataset();
  
  const { data: run, error: runError } = await supabase.from('evaluation_runs').insert({
    label: "Phase 09 Complete Audit Run",
    merchant_id: merchantId,
    status: "running",
    dataset_version: DATASET_VERSION,
    dataset_seed: DATASET_SEED,
    prompt_version: PROMPT_VERSION,
    model: "google/gemini-3.7-flash",
    scenario_count: 246,
    kind: "audit",
    batch_size: 25,
    synthetic: true
  }).select().single();
  
  if (runError) {
    console.error("Error creating run:", runError);
    return;
  }
  
  const runId = run.id;
  console.log(`Started Run ID: ${runId}`);
  
  let totalProcessed = 0;
  const target = 246;
  
  while (totalProcessed < target) {
    console.log(`Processing batch starting from ${totalProcessed}...`);
    try {
      const results = await processEvaluationBatch(runId, 25);
      totalProcessed += (results || []).length;
      console.log(`Processed ${(results || []).length} results. Total: ${totalProcessed}/${target}`);
      if (!results || results.length === 0) {
        console.log("Empty results, sleeping...");
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      console.error("Batch error:", e);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  await supabase.from('evaluation_runs').update({
    status: "completed",
    completed_at: new Date().toISOString()
  }).eq('id', runId);
  
  console.log("Evaluation complete!");
}

run();
