

-- 2. CLEAN CLIENT DUPLICATES (Keep newest, delete by email)
-- Only if email is present, otherwise keep by name
DELETE FROM agency_clients
WHERE id NOT IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(email, name) ORDER BY created_at DESC) as row_num
        FROM agency_clients
    ) t
    WHERE row_num = 1
);

-- 3. ADD UNIQUE CONSTRAINTS (To prevent future duplicates from SQL re-runs)
-- Note: This might fail if duplicates still exist, run the cleanup above first.
ALTER TABLE agency_tools ADD CONSTRAINT unique_tool_name UNIQUE (name);
-- Optional: ALTER TABLE agency_clients ADD CONSTRAINT unique_client_email UNIQUE (email);
-- 1. CLEAN TOOLS DUPLICATES (Keep newest, delete others by name)
DELETE FROM agency_tools
WHERE id NOT IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) as row_num
        FROM agency_tools
    ) t
    WHERE row_num = 1
);