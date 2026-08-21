INSERT INTO public.products (id, merchant_id, name, description, category, price, currency, stock_quantity, status)
SELECT '33333333-3333-4333-8333-000000000006', m.id,
       'Legacy Charger 45W (discontinued)',
       'Retired charger kept for order history; not available for sale.',
       'Accessories', 999, 'INR', 0, 'inactive'
FROM public.merchants m WHERE m.slug = 'technova-store'
ON CONFLICT (id) DO NOTHING;