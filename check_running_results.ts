import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data: results } = await supabase.from('evaluation_results')
    .select('*, scenario:evaluation_scenarios(*)')
    .in('status', ['running', 'completed'])
    .order('updated_at', { ascending: false })
    .limit(10);
    
  console.log(JSON.stringify(results, null, 2));
}
check();
