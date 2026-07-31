package com.mint.server.db;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Applies bundled, additive SQLite migrations without a SQLite-specific plugin. */
@Component
public class SqliteMigrationRunner {
    private static final Migration[] MIGRATIONS = {
            new Migration(1, "V1__mint_core_schema.sql"),
            new Migration(2, "V2__mcp_tool_definitions.sql"),
            new Migration(3, "V3__token_usage.sql"),
            new Migration(4, "V4__wiki_search_index.sql"),
            new Migration(5, "V5__wiki_ingestion_jobs.sql"),
            new Migration(6, "V6__agents.sql"),
            new Migration(7, "V7__align_node_schema.sql"),
            new Migration(8, "V8__a2ui_defaults.sql")
    };
    private final JdbcTemplate jdbc;

    /** Creates the runner and applies pending migrations after datasource creation. */
    public SqliteMigrationRunner(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        migrate();
    }

    /** Applies each migration once and records it in a local schema history table. */
    private void migrate() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS mint_java_schema_history "
                + "(version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL)");
        for (Migration migration : MIGRATIONS) {
            Integer applied = jdbc.queryForObject("SELECT COUNT(*) FROM mint_java_schema_history WHERE version = ?",
                    Integer.class, migration.version());
            if (applied != null && applied > 0) continue;
            Arrays.stream(readMigration(migration.file()).split(";"))
                    .map(String::trim)
                    .filter(statement -> !statement.isEmpty())
                    .forEach(this::executeMigrationStatement);
            jdbc.update("INSERT INTO mint_java_schema_history(version, description, applied_at) VALUES (?, ?, datetime('now'))",
                    migration.version(), migration.file());
        }
    }

    /** Executes additive DDL while allowing a column to have been added by an older compatible schema. */
    private void executeMigrationStatement(String statement) {
        try {
            jdbc.execute(statement);
        } catch (RuntimeException error) {
            if (error.getMessage() == null || !error.getMessage().toLowerCase().contains("duplicate column")) {
                throw error;
            }
        }
    }

    /** Reads the bundled migration resource. */
    private String readMigration(String file) {
        ClassPathResource resource = new ClassPathResource("db/migration/" + file);
        try (InputStream stream = resource.getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read SQLite migration " + file, error);
        }
    }

    private record Migration(int version, String file) {
    }
}
