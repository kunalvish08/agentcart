import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data: run } = await supabase.from('evaluation_runs').select('*').order('created_at', { ascending: false }).limit(1).single();
  console.log("Run:", JSON.stringify(run, null, 2));
  
  if (run) {
    const { data: results } = await supabase.from('evaluation_results').select('status').eq('run_id', run.id);
    const counts = results?.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as any);
    console.log("Counts:", counts);
  }
}
check();
