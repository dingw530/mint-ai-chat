package com.mint.server.security;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Constrains tool filesystem access to the configured workspace directory. */
@Component
public class WorkspaceGuard {
    private final Path workspace;

    /** Creates a guard rooted at the container workspace. */
    public WorkspaceGuard(@Value("${mint.workspace.path:/workspace}") String workspace) {
        this.workspace = Paths.get(workspace).toAbsolutePath().normalize();
    }

    /** Returns a validated path within the workspace, creating no files. */
    public Path resolve(String requested) {
        if (requested == null || requested.isBlank()) return workspace;
        Path path = workspace.resolve(requested).normalize();
        if (!path.startsWith(workspace)) throw new SecurityException("Path must stay within /workspace");
        return path;
    }

    /** Validates an existing path after symlink resolution. */
    public Path resolveExisting(String requested) {
        try {
            Path path = resolve(requested).toRealPath();
            if (!path.startsWith(workspace.toRealPath())) throw new SecurityException("Path must stay within /workspace");
            return path;
        } catch (IOException error) {
            throw new IllegalArgumentException("Workspace path does not exist", error);
        }
    }

    /** Returns the configured workspace root. */
    public Path root() {
        return workspace;
    }

    /** Ensures the workspace root exists for local development and Docker volumes. */
    public void ensureRoot() {
        try {
            Files.createDirectories(workspace);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to initialize workspace", error);
        }
    }
}
