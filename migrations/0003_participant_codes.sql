ALTER TABLE accounts ADD COLUMN participant_code TEXT;

UPDATE accounts
SET participant_code = 'DD-' || substr(upper(hex(randomblob(5))), 1, 10)
WHERE participant_code IS NULL OR participant_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_participant_code
ON accounts (participant_code);
