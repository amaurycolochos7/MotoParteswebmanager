-- ============================================================================
-- 006_motopartes_questions.sql
-- Módulo interno "MotoPartes Questions" — cuestionario privado por PIN.
--
-- IMPORTANTE sobre cómo se aplica en este proyecto:
--   El contenedor API arranca con `npx prisma db push --accept-data-loss`
--   (ver apps/api/Dockerfile). `db push` sincroniza el esquema desde
--   apps/api/prisma/schema.prisma, donde ya se añadieron los modelos
--   SurveyParticipant, SurveyAnswer y SurveyEvent. Por lo tanto, en el flujo
--   normal de despliegue NO necesitas correr este SQL a mano: las tablas se
--   crean solas en el próximo arranque.
--
--   Este archivo existe como DOCUMENTACIÓN y para aplicación manual opcional
--   (p. ej. `psql $DATABASE_URL -f migrations/006_motopartes_questions.sql`)
--   en entornos donde se prefiera SQL explícito.
--
-- Es ADITIVO: solo crea tablas nuevas. NO modifica ni borra datos existentes.
-- Las tablas NO tienen workspace_id y NO participan del auto-scoping de Prisma.
-- ============================================================================

CREATE TABLE IF NOT EXISTS survey_participants (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key            TEXT NOT NULL UNIQUE,                  -- ELIHU | MACIEL
    display_name   TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'NOT_STARTED',   -- NOT_STARTED | IN_PROGRESS | SUBMITTED
    locked         BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at   TIMESTAMPTZ,
    survey_version TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_answers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES survey_participants(id) ON DELETE CASCADE,
    question_key   TEXT NOT NULL,
    answer_value   JSONB,
    answer_text    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT survey_answers_participant_question_unique UNIQUE (participant_id, question_key)
);
CREATE INDEX IF NOT EXISTS survey_answers_participant_idx ON survey_answers(participant_id);

CREATE TABLE IF NOT EXISTS survey_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor           TEXT NOT NULL,                        -- admin | ELIHU | MACIEL
    action          TEXT NOT NULL,                        -- login | save | submit | unlock | export
    participant_key TEXT,
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_events_created_idx ON survey_events(created_at);
