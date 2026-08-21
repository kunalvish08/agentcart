import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const { data, error } = await supabase.rpc('get_tables');
  if (error) {
     // If RPC doesn't exist, try a simple query on a known table
     const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
     console.log("Profiles exist:", !!profiles);
     
     const { data: eruns, error: err } = await supabase.from('evaluation_runs').select('*').limit(1);
     console.log("Evaluation runs error:", err);
  } else {
     console.log("Tables:", data);
  }
}
run();
