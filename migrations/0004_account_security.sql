ALTER TABLE accounts ADD COLUMN pin_algorithm TEXT NOT NULL DEFAULT 'sha256';

UPDATE accounts
SET pin_algorithm = 'sha256'
WHERE pin_algorithm IS NULL OR pin_algorithm = '';
