-- 1. LIMPIEZA DE HERRAMIENTAS (Borra los duplicados manteniendo solo el más nuevo)
DELETE FROM agency_tools a USING agency_tools b
WHERE a.created_at < b.created_at 
  AND a.name = b.name;

-- 2. LIMPIEZA DE LEADS/CLIENTES (Borra duplicados por email/nombre)
DELETE FROM agency_clients a USING agency_clients b
WHERE a.created_at < b.created_at 
  AND COALESCE(a.email, a.name) = COALESCE(b.email, b.name);

-- 3. AGREGAR RESTRICCIONES (CORRER ESTO SOLO DESPUÉS DE LOS DELETES)
-- Seleccioná y ejecutá estas líneas una por una:
-- ALTER TABLE agency_tools ADD CONSTRAINT unique_tool_name UNIQUE (name);
-- ALTER TABLE agency_clients ADD CONSTRAINT unique_client_email UNIQUE (email);
