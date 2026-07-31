package com.mint.server.skill;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Keeps the settings-page skills endpoint available in HTTP mode. */
@RestController
@RequestMapping("/api/skills")
public class SkillController {
    private final SkillService service;
    public SkillController(SkillService service) { this.service = service; }
    /** Returns the currently available HTTP skills. */
    @GetMapping({"", "/"})
    public Map<String, List<Map<String, String>>> list() {
        return Map.of("skills", service.list());
    }
}
