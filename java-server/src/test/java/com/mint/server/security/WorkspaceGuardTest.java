package com.mint.server.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import org.junit.jupiter.api.Test;

class WorkspaceGuardTest {
    /** Allows relative paths inside the workspace. */
    @Test
    void allowsWorkspacePath() throws Exception {
        var root = Files.createTempDirectory("mint-workspace");
        var guard = new WorkspaceGuard(root.toString());
        Files.createDirectories(root.resolve("src"));
        Files.createFile(root.resolve("src/main.ts"));

        assertThat(guard.resolve("src/main.ts")).startsWith(root);
    }

    /** Rejects traversal and absolute paths outside the workspace. */
    @Test
    void rejectsEscape() throws Exception {
        var root = Files.createTempDirectory("mint-workspace");
        var guard = new WorkspaceGuard(root.toString());

        assertThatThrownBy(() -> guard.resolve("../../etc/passwd"))
                .isInstanceOf(SecurityException.class);
    }
}
