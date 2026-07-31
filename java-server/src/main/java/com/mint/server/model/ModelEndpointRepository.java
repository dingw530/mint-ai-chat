package com.mint.server.model;

import com.mint.server.db.mapper.SqlMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for model endpoints. */
@Repository
public class ModelEndpointRepository {
    private final SqlMapper mapper;
    public ModelEndpointRepository(SqlMapper mapper) { this.mapper = mapper; }
    public Optional<ModelEndpoint> activeText() { return mapper.activeEndpoint().stream().map(this::map).findFirst(); }
    /** Finds one endpoint by id. */
    public Optional<ModelEndpoint> findById(String id) { return mapper.endpoint(id).stream().map(this::map).findFirst(); }
    public List<ModelEndpoint> findAll() { return mapper.endpoints().stream().map(this::map).toList(); }
    public int count() { return mapper.endpointCount(); }
    public void insert(ModelEndpoint e) { mapper.insertEndpoint(params(e)); }
    public void update(ModelEndpoint e, boolean replaceKey) { if (replaceKey) mapper.updateEndpointWithKey(params(e)); else mapper.updateEndpoint(params(e)); }
    public int delete(String id) { return mapper.deleteEndpoint(id); }
    public void activate(String id, String now) { mapper.deactivateEndpoints(); mapper.activateEndpoint(Map.of("id", id, "now", now)); }
    private Map<String,Object> params(ModelEndpoint e) { Map<String,Object> p=new HashMap<>();p.put("id",e.getId());p.put("name",e.getName());p.put("apiUrl",e.getApiUrl());p.put("apiKey",e.getEncryptedApiKey());p.put("modelId",e.getModelId());p.put("apiType",e.getApiType());p.put("category",e.getCategory());p.put("active",e.isActive()?1:0);p.put("sortOrder",e.getSortOrder());p.put("createdAt",e.getCreatedAt());p.put("updatedAt",e.getUpdatedAt());return p; }
    private ModelEndpoint map(Map<String,Object> r) { return new ModelEndpoint(text(r,"id"),text(r,"name"),text(r,"apiUrl","api_url"),text(r,"apiKey","api_key"),text(r,"modelId","model_id"),text(r,"apiType","api_type"),text(r,"category"),number(value(r,"isActive","is_active"))==1,number(value(r,"sortOrder","sort_order")),text(r,"createdAt","created_at"),text(r,"updatedAt","updated_at")); }
    private Object value(Map<String,Object> row,String... keys) { for (String key: keys) if (row.containsKey(key)) return row.get(key); return null; }
    private String text(Map<String,Object> row,String... keys) { Object value=value(row,keys); return value == null ? null : String.valueOf(value); }
    private int number(Object v) { return v instanceof Number n ? n.intValue() : 0; }
}
