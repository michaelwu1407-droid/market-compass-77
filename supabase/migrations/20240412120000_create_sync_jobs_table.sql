CREATE TABLE sync_jobs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    job_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);