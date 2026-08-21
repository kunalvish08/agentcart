import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function summarize() {
  const { data: run } = await supabase.from('evaluation_runs').select('id').order('created_at', { ascending: false }).limit(1).single();
  if (!run) return;
  
  const { data: results } = await supabase.from('evaluation_results')
    .select('*, scenario:evaluation_scenarios(*)')
    .eq('run_id', run.id)
    .eq('baseline_type', 'agentic')
    .eq('status', 'completed');
    
  if (!results) return;
  
  const failures = results.filter(r => !r.outcome_match);
  console.log(`Completed Agentic Runs: ${results.length}`);
  console.log(`Misses: ${failures.length} (${((failures.length/results.length)*100).toFixed(1)}%)`);
  
  const byCategory = failures.reduce((acc, r) => {
    const cat = r.scenario?.category || 'unknown';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as any);
  
  console.log("Misses by category:", byCategory);
  
  // Sample a few misses to understand why
  failures.slice(0, 5).forEach(f => {
    console.log(`--- Scenario: ${f.scenario_id} (${f.scenario?.category}) ---`);
    console.log(`Intent: ${f.scenario?.intent}`);
    console.log(`Expected: ${f.expected_outcome} | Actual: ${f.actual_outcome}`);
    console.log(`Evidence: ${f.detail?.evidence || 'none'}`);
  });
}
summarize();
