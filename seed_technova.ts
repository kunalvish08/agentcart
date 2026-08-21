import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const userId = "11111111-1111-4111-8111-111111111111"; // Deterministic demo user
  
  // 1. Ensure user and role
  await supabase.from('profiles').upsert({
    id: userId,
    email: "demo@technova.test",
    full_name: "TechNova Merchant"
  });
  
  await supabase.from('user_roles').upsert({
    user_id: userId,
    role: 'merchant'
  });

  // 2. Create merchant
  const { data: merchant } = await supabase.from('merchants').upsert({
    owner_id: userId,
    name: "TechNova Store",
    slug: "technova-store",
    description: "AI-native electronics merchant.",
    currency: "INR",
    agent_commerce_enabled: true
  }).select().single();

  if (merchant) {
    console.log("TechNova Merchant ID:", merchant.id);
    
    // 3. Create products
    const products = [
      { merchant_id: merchant.id, name: "DeveloperBook Pro 15", price: 85000, category: "Laptops", stock_quantity: 50, status: 'active' },
      { merchant_id: merchant.id, name: "Mechanical Keyboard", price: 4500, category: "Accessories", stock_quantity: 100, status: 'active' },
      { merchant_id: merchant.id, name: "Wireless Mouse", price: 2500, category: "Accessories", stock_quantity: 100, status: 'active' },
      { merchant_id: merchant.id, name: "USB-C Hub", price: 3500, category: "Accessories", stock_quantity: 50, status: 'active' },
      { merchant_id: merchant.id, name: "Laptop Stand", price: 1500, category: "Accessories", stock_quantity: 50, status: 'active' }
    ];
    
    await supabase.from('products').upsert(products);
    
    // 4. Policy
    await supabase.from('merchant_policies').upsert({
      merchant_id: merchant.id,
      max_discount_percent: 12,
      max_order_value: 100000,
      approval_required_above: 50000,
      allow_negotiation: true,
      allow_upsell: true
    });
  }
}

run();
