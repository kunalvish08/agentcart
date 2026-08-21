UPDATE public.merchant_policies p
SET max_discount_percent = 12, updated_at = now()
FROM public.merchants m
WHERE m.id = p.merchant_id AND m.slug = 'technova-store';