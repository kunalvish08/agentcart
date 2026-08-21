import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function audit() {
  const runId = "03baab2c-57c3-426a-b1d9-5d20b6e66ce5";
  const { data: results } = await supabase.from('evaluation_results').select('*').eq('run_id', runId);
  console.log("Total results:", results?.length);
  
  if (results) {
    const summary = results.reduce((acc, r) => {
      acc[r.baseline_type] = (acc[r.baseline_type] || 0) + 1;
      return acc;
    }, {} as any);
    console.log("Summary:", summary);
    
    // Check for outcome match rate
    const agentic = results.filter(r => r.baseline_type === 'agentic');
    const matches = agentic.filter(r => r.outcome_match).length;
    console.log(`Agentic Match Rate: ${matches}/${agentic.length} (${((matches/agentic.length)*100).toFixed(1)}%)`);
  }
}
audit();
