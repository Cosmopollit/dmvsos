-- Phone number captured at Stripe checkout (when phone_number_collection enabled).
-- Optional; only filled when Stripe Checkout asks for it and customer provides.
alter table profiles add column if not exists phone text;
