import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const runId = "87db0348-8b51-4176-9014-1721a8e2cfd4";
  
  const { data: run, error: runError } = await supabase
    .from('evaluation_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runError) {
    console.error("Error fetching run:", runError);
    // Try to find the latest run if that one is gone
    const { data: latest } = await supabase.from('evaluation_runs').select('*').order('created_at', { ascending: false }).limit(1).single();
    console.log("Latest run:", latest);
    return;
  }

  const { count, error: countError } = await supabase
    .from('evaluation_results')
    .select('*', { count: 'exact', head: true })
    .eq('run_id', runId);

  console.log(JSON.stringify({
    run,
    resultsCount: count
  }, null, 2));
}

check();
