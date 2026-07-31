package com.mint.server.tool;

import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import com.mint.server.security.BashSecurityService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

/** Executes Bash only inside the configured workspace boundary. */
@Component
public class BashTool implements Tool {
    private final WorkspaceGuard workspace;
    private final BashSecurityService security;

    /** Creates the sandboxed Bash tool. */
    public BashTool(WorkspaceGuard workspace, BashSecurityService security) {
        this.workspace = workspace;
        this.security = security;
    }

    @Override
    public String name() {
        return "bash";
    }

    @Override
    public ToolDefinition definition() {
        return new ToolDefinition(name(), "Execute a shell command inside /workspace only.",
                Map.of("type", "object", "properties", Map.of(
                        "command", Map.of("type", "string"),
                        "workingDirectory", Map.of("type", "string")),
                        "required", List.of("command")));
    }

    @Override
    public String execute(Map<String, Object> arguments, String conversationId) {
        workspace.ensureRoot();
        String command = String.valueOf(arguments.getOrDefault("command", "")).trim();
        if (command.isEmpty()) return "command is required";
        String directory = String.valueOf(arguments.getOrDefault("workingDirectory", "."));
        Path workingDirectory = workspace.resolve(directory);
        if (!workingDirectory.normalize().startsWith(workspace.root())) {
            return "Permission denied: workingDirectory must stay within /workspace";
        }
        if (security.blocked(command, workingDirectory.toString())) {
            return "Command blocked by Bash security policy";
        }
        try {
            Process process = new ProcessBuilder(List.of("/bin/bash", "-lc", command))
                    .directory(workingDirectory.toFile())
                    .redirectErrorStream(true)
                    .start();
            boolean finished = process.waitFor(Duration.ofSeconds(30).toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                return "Command timed out after 30 seconds";
            }
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (output.length() > 32_000) output = output.substring(0, 32_000) + "\n[output truncated]";
            return "exitCode=" + process.exitValue() + "\n" + output;
        } catch (IOException error) {
            return "Command failed: " + error.getMessage();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return "Command interrupted";
        }
    }
}
