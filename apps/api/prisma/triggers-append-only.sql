-- Fase 7.4 — Triggers Postgres para convertir super_admin_actions y
-- impersonation_sessions en append-only. Nadie (ni un super-admin, ni el
-- dueño del repo) puede borrar o modificar registros de auditoría una vez
-- creados.
--
-- Excepción práctica: UPDATE en impersonation_sessions permitido SOLO para
-- setear ended_at y actions_taken (el flujo normal de cerrar sesión). Todo
-- lo demás queda bloqueado.
--
-- Ejecutar una vez manualmente:
--   docker exec <api> sh -c 'psql $DATABASE_URL < /app/prisma/triggers-append-only.sql'
-- O cargar con `docker cp` + psql.
-- Idempotente: si el trigger ya existe, se redefine.

-- ═══ super_admin_actions: sin DELETE ni UPDATE ═══

CREATE OR REPLACE FUNCTION super_admin_actions_no_modify()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'super_admin_actions es append-only — no se puede % (id=%)', TG_OP, OLD.id
        USING HINT = 'La auditoría del super-admin es inmutable por diseño.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_super_admin_actions_no_delete ON super_admin_actions;
CREATE TRIGGER trg_super_admin_actions_no_delete
    BEFORE DELETE ON super_admin_actions
    FOR EACH ROW EXECUTE FUNCTION super_admin_actions_no_modify();

DROP TRIGGER IF EXISTS trg_super_admin_actions_no_update ON super_admin_actions;
CREATE TRIGGER trg_super_admin_actions_no_update
    BEFORE UPDATE ON super_admin_actions
    FOR EACH ROW EXECUTE FUNCTION super_admin_actions_no_modify();

-- ═══ impersonation_sessions: sin DELETE; UPDATE limitado ═══

CREATE OR REPLACE FUNCTION impersonation_sessions_no_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'impersonation_sessions es append-only — no se puede DELETE (id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_impersonation_no_delete ON impersonation_sessions;
CREATE TRIGGER trg_impersonation_no_delete
    BEFORE DELETE ON impersonation_sessions
    FOR EACH ROW EXECUTE FUNCTION impersonation_sessions_no_delete();

-- Permitido: SOLO setear ended_at y actions_taken. Cualquier otro cambio bloqueado.
CREATE OR REPLACE FUNCTION impersonation_sessions_limited_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.super_admin_id <> OLD.super_admin_id
        OR NEW.workspace_id <> OLD.workspace_id
        OR NEW.profile_imp_id <> OLD.profile_imp_id
        OR NEW.reason <> OLD.reason
        OR NEW.started_at <> OLD.started_at
        OR NEW.expires_at <> OLD.expires_at
        OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
    THEN
        RAISE EXCEPTION 'impersonation_sessions: solo ended_at y actions_taken son modificables';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_impersonation_limited_update ON impersonation_sessions;
CREATE TRIGGER trg_impersonation_limited_update
    BEFORE UPDATE ON impersonation_sessions
    FOR EACH ROW EXECUTE FUNCTION impersonation_sessions_limited_update();

SELECT 'Triggers append-only instalados en super_admin_actions y impersonation_sessions' AS status;
