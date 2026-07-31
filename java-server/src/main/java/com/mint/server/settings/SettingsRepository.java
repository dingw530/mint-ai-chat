package com.mint.server.settings;

import com.mint.server.db.mapper.SqlMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for runtime settings. */
@Repository
public class SettingsRepository {
    private final SqlMapper mapper;
    public SettingsRepository(SqlMapper mapper) { this.mapper = mapper; }
    public Map<String,String> findAll() { Map<String,String> result=new LinkedHashMap<>(); mapper.settings().forEach(r -> result.put((String)r.get("key"),(String)r.get("value"))); return result; }
    public void save(Map<String,String> values) { values.forEach((key,value) -> mapper.saveSetting(Map.of("key",key,"value",value))); }
    public void updateActiveEndpoint(String apiUrl,String apiKey,String modelId,String now) { Map<String,Object> p=new LinkedHashMap<>();p.put("apiUrl",apiUrl);p.put("apiKey",apiKey);p.put("modelId",modelId);p.put("now",now);if(apiKey==null)mapper.updateActiveSettings(p);else mapper.updateActiveSettingsWithKey(p); }
}
