import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { buildDataset, DATASET_SEED, DATASET_VERSION, PROMPT_VERSION } from './src/lib/evaluation-dataset';
import { processEvaluationBatch } from './src/lib/evaluation-worker.server';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const merchantId = "98765432-1111-4111-8111-111111111111"; // TechNova
  const scenarios = buildDataset();
  
  // 1. Create the run record
  const { data: run, error: runError } = await supabase.from('evaluation_runs').insert({
    label: "Phase 09 Complete Audit Run",
    merchant_id: merchantId,
    status: "running",
    dataset_version: DATASET_VERSION,
    dataset_seed: DATASET_SEED,
    prompt_version: PROMPT_VERSION,
    model: "google/gemini-3.7-flash",
    scenario_count: scenarios.length * 2 + 6, // Agentic + Traditional + Probes
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
  
  // 2. The summary mentions 120 Agentic, 120 Traditional, 6 Safety = 246 total.
  // We need to process them all.
  
  let totalProcessed = 0;
  const target = 246;
  
  while (totalProcessed < target) {
    console.log(`Processing batch starting from ${totalProcessed}...`);
    try {
      const results = await processEvaluationBatch(runId, 25);
      totalProcessed += results.length;
      console.log(`Processed ${results.length} results. Total: ${totalProcessed}/${target}`);
      if (results.length === 0) break;
    } catch (e) {
      console.error("Batch error:", e);
      break;
    }
  }
  
  // 3. Mark as completed
  await supabase.from('evaluation_runs').update({
    status: "completed",
    completed_at: new Date().toISOString()
  }).eq('id', runId);
  
  console.log("Evaluation complete!");
}

run();
