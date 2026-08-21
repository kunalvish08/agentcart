import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function audit() {
  const { data: run } = await supabase.from('evaluation_runs').select('id, status').eq('status', 'running').order('created_at', { ascending: false }).limit(1).single();
  if (!run) {
     const { data: lastRun } = await supabase.from('evaluation_runs').select('id, status').order('created_at', { ascending: false }).limit(1).single();
     console.log("Last run:", lastRun);
     if (lastRun) auditRun(lastRun.id);
     return;
  }
  auditRun(run.id);
}

async function auditRun(runId: string) {
  const { data: results } = await supabase.from('evaluation_results').select('*').eq('run_id', runId);
  console.log(`Run ID: ${runId}`);
  console.log(`Total results: ${results?.length}`);
  console.log(`Completed: ${results?.filter(r => r.status === 'completed').length}`);
  console.log(`Harness errors: ${results?.filter(r => r.status === 'harness_error').length}`);
  
  const agentic = results?.filter(r => r.baseline_type === 'agentic' && r.status === 'completed') || [];
  const matches = agentic.filter(r => r.outcome_match).length;
  console.log(`Agentic Match Rate: ${matches}/${agentic.length} (${agentic.length > 0 ? ((matches/agentic.length)*100).toFixed(1) : 0}%)`);
}
audit();
