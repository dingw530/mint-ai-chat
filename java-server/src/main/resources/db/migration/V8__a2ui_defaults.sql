INSERT OR IGNORE INTO a2ui_component_registry
    (kind,catalog_id,component_name,data_schema_version,data_schema,enabled,created_at,updated_at)
VALUES
    ('wiki_source_reference','mint','SourceReferenceCard',1,'{}',1,datetime('now'),datetime('now'));
INSERT OR IGNORE INTO a2ui_component_registry
    (kind,catalog_id,component_name,data_schema_version,data_schema,enabled,created_at,updated_at)
VALUES
    ('ingestion_task','mint','IngestionTaskCard',1,'{}',1,datetime('now'),datetime('now'));
