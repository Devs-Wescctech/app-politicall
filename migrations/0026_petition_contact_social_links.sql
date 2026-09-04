ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_whatsapp text;
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_facebook_url text;
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_x_url text;
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS contact_telegram_url text;
