package com.mint.server.security.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** Persisted Bash deny lists returned by the settings endpoint. */
@Getter
@AllArgsConstructor
public class BashSecurityResponse {
    private List<String> blockedCommands;
    private List<String> blockedDirs;
}
