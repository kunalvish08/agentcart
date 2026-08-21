import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const { data: runs } = await supabase.from('evaluation_runs').select('id, name, status, created_at').order('created_at', { ascending: false });
  console.log("Evaluation Runs:", runs);
  
  if (runs && runs.length > 0) {
    const { count } = await supabase.from('evaluation_results').select('*', { count: 'exact', head: true }).eq('run_id', runs[0].id);
    console.log("Results in latest run:", count);
  }
}
run();
