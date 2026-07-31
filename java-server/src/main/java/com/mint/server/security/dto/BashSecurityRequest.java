package com.mint.server.security.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Request body for the user-configurable Bash deny lists. */
@Getter
@Setter
@NoArgsConstructor
public class BashSecurityRequest {
    private List<String> blockedCommands = new ArrayList<>();
    private List<String> blockedDirs = new ArrayList<>();
}
