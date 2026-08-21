import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data: run } = await supabase.from('evaluation_runs').select('id, status').order('created_at', { ascending: false }).limit(1).single();
  if (!run) return;
  const { data: results } = await supabase.from('evaluation_results').select('status, outcome_match, baseline_type').eq('run_id', run.id);
  const completedCount = results?.filter(r => r.status === 'completed').length || 0;
  const agenticMatch = results?.filter(r => r.baseline_type === 'agentic' && r.status === 'completed' && r.outcome_match).length || 0;
  const agenticTotal = results?.filter(r => r.baseline_type === 'agentic' && r.status === 'completed').length || 0;
  
  console.log(`Run status: ${run.status}`);
  console.log(`Total completed: ${completedCount}/246`);
  console.log(`Agentic match rate so far: ${agenticMatch}/${agenticTotal}`);
}
check();
