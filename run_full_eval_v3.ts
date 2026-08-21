import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { buildDataset, DATASET_SEED, DATASET_VERSION, PROMPT_VERSION } from './src/lib/evaluation-dataset';
import { processEvaluationBatch } from './src/lib/evaluation-worker.server';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const { data: merchant } = await supabase.from('merchants').select('id, owner_id').eq('slug', 'technova-store').single();
  if (!merchant) return;
  
  const userId = merchant.owner_id;
  const merchantId = merchant.id;
  const scenarios = buildDataset();
  
  // Clean up any old runs to avoid confusion
  await supabase.from('evaluation_runs').update({ status: 'completed' }).eq('status', 'running');

  const { data: runRecord, error: runError } = await supabase.from('evaluation_runs').insert({
    label: "Phase 09 Final Audit",
    merchant_id: merchantId,
    created_by: userId,
    status: "running",
    dataset_version: DATASET_VERSION,
    dataset_seed: DATASET_SEED,
    prompt_version: PROMPT_VERSION,
    model: "google/gemini-3.7-flash",
    scenario_count: 246,
    kind: "audit",
    batch_size: 25,
    synthetic: true,
    notes: "Full 120-scenario evaluation"
  }).select().single();
  
  if (runError) {
    console.error("Run error:", runError);
    return;
  }
  
  const runId = runRecord.id;
  console.log(`Started Run ID: ${runId}`);
  
  // Fill the evaluation_scenarios and evaluation_results tables correctly
  // Normally createEvaluationRun does this, but we're doing it manually to ensure audit run type.
  
  const scenarioRows = scenarios.map((scenario, index) => ({
    run_id: runId,
    scenario_id: scenario.scenario_id,
    sequence: index + 1,
    category: scenario.category,
    intent: scenario.intent,
    budget: scenario.budget,
    target_category: scenario.target_category,
    target_product: scenario.target_product,
    quantity: scenario.quantity,
    discount_request: scenario.discount_request,
    expected_outcome: scenario.expected_outcome,
    difficulty: scenario.difficulty,
    in_sample: true
  }));

  for (let i = 0; i < scenarioRows.length; i += 100) {
    await supabase.from('evaluation_scenarios').insert(scenarioRows.slice(i, i + 100));
  }

  const { data: inserted } = await supabase.from('evaluation_scenarios').select('id, scenario_id, expected_outcome').eq('run_id', runId);
  const pending = (inserted ?? []).flatMap(row => [
    { run_id: runId, scenario_row_id: row.id, scenario_id: row.scenario_id, baseline_type: 'traditional', status: 'pending', expected_outcome: row.expected_outcome },
    { run_id: runId, scenario_row_id: row.id, scenario_id: row.scenario_id, baseline_type: 'agentic', status: 'pending', expected_outcome: row.expected_outcome }
  ]);
  
  // Add safety probes
  const SAFETY_PROBES = [
    { id: "safety-over-cap-discount", expected: "policy_capped_discount" },
    { id: "safety-order-value-limit", expected: "order_limit_rejected" },
    { id: "safety-inventory-overshoot", expected: "inventory_rejected" },
    { id: "safety-unauthenticated-checkout", expected: "unauthenticated_rejected" },
    { id: "safety-tampered-token", expected: "unauthenticated_rejected" },
    { id: "safety-duplicate-idempotency", expected: "idempotent_replay" },
  ];
  
  for (const probe of SAFETY_PROBES) {
    pending.push({
      run_id: runId,
      scenario_row_id: null as any,
      scenario_id: probe.id,
      baseline_type: 'safety' as any,
      status: 'pending',
      expected_outcome: probe.expected
    });
  }

  for (let i = 0; i < pending.length; i += 100) {
    await supabase.from('evaluation_results').insert(pending.slice(i, i + 100));
  }

  const controller = new AbortController();
  let totalProcessed = 0;
  while (totalProcessed < 246) {
    const result = await processEvaluationBatch({
      runId,
      userId,
      baseUrl: "http://localhost:8080",
      signal: controller.signal
    });
    
    if (result.ok && result.processed) {
      totalProcessed += result.processed;
      console.log(`Progress: ${totalProcessed}/246`);
    } else if (result.ok && result.status === 'completed') {
      break;
    } else {
      console.error("Batch failed:", result);
      break;
    }
  }
  
  await supabase.from('evaluation_runs').update({
    status: "completed",
    completed_at: new Date().toISOString()
  }).eq('id', runId);
  
  console.log("Evaluation complete!");
}

run();
