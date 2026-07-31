package com.mint.server.security;

import com.mint.server.db.mapper.SqlMapper;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for Bash security settings. */
@Repository
public class BashSecurityRepository {
    private final SqlMapper mapper;
    public BashSecurityRepository(SqlMapper mapper) { this.mapper = mapper; }
    public String read(String key) { return mapper.bashSetting(key).stream().findFirst().map(r -> String.valueOf(r.get("value"))).orElse("[]"); }
    public void replace(String key,String json) { mapper.replaceBash(Map.of("key",key,"value",json)); }
}
