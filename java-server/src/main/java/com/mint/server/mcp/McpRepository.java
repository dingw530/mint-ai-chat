package com.mint.server.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.db.mapper.SqlMapper;
import com.mint.server.mcp.dto.McpServerResponse;
import com.mint.server.mcp.dto.McpToolRequest;
import com.mint.server.mcp.dto.McpToolResponse;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for configured MCP servers and tools. */
@Repository
public class McpRepository {
    private final SqlMapper mapper; private final ObjectMapper json;
    public McpRepository(SqlMapper mapper,ObjectMapper json){this.mapper=mapper;this.json=json;}
    public List<McpServerResponse> findAll(){return mapper.mcpServers().stream().map(this::server).toList();}
    public void insertServer(String id,String name,String url,String headers,String now){Map<String,Object> p=new HashMap<>();p.put("id",id);p.put("name",name);p.put("url",url);p.put("headers",headers);p.put("now",now);mapper.insertMcpServer(p);}
    public int updateServer(String id,String name,String url,String headers,String now){Map<String,Object> p=new HashMap<>();p.put("id",id);p.put("name",name);p.put("url",url);p.put("headers",headers);p.put("now",now);return mapper.updateMcpServer(p);}
    public void deleteTools(String id){mapper.deleteMcpTools(id);}
    public void insertTool(String serverId,McpToolRequest tool,String schema,String transport,String now){Map<String,Object> p=new HashMap<>();p.put("id",UUID.randomUUID().toString());p.put("serverId",serverId);p.put("name",tool.getName());p.put("description",tool.getDescription()==null?"":tool.getDescription());p.put("inputSchema",schema);p.put("transport",transport);p.put("now",now);mapper.insertMcpTool(p);}
    public void deleteServer(String id){mapper.deleteMcpServer(id);}
    public List<McpToolRegistration> findRegisteredTools(){return mapper.registeredMcpTools().stream().map(r->new McpToolRegistration(text(r,"serverName","server_name"),text(r,"url"),stringMap(text(r,"headers")),text(r,"name"),text(r,"description"),parse(text(r,"inputSchema","input_schema")),text(r,"transport"))).toList();}
    private McpServerResponse server(Map<String,Object> r){String id=(String)r.get("id");List<McpToolResponse> tools=mapper.mcpTools(id).stream().map(t->new McpToolResponse((String)t.get("name"),(String)t.get("description"),parse((String)t.get("inputSchema")),(String)t.get("transport"))).toList();return new McpServerResponse(id,(String)r.get("name"),(String)r.get("command"),value((String)r.get("args"),List.of()),parse((String)r.get("env")),(String)r.get("url"),parse((String)r.get("headers")),(String)r.get("status"),(String)r.get("errorMessage"),(String)r.get("createdAt"),(String)r.get("updatedAt"),tools);}
    private Map<String,Object> parse(String v){try{return json.readValue(v==null?"{}":v,Map.class);}catch(Exception e){return Map.of();}}
    private String text(Map<String,Object> row,String... keys){for(String key:keys)if(row.containsKey(key)&&row.get(key)!=null)return String.valueOf(row.get(key));return null;}
    private Object value(String v,Object fallback){try{return json.readValue(v==null?"null":v,Object.class);}catch(Exception e){return fallback;}}
    private Map<String,String> stringMap(String v){Map<String,String> m=new LinkedHashMap<>();parse(v).forEach((k,x)->m.put(k,String.valueOf(x)));return m;}
    public static class McpToolRegistration {private final String serverName,url,name,description,transport;private final Map<String,String> headers;private final Map<String,Object> schema;public McpToolRegistration(String serverName,String url,Map<String,String> headers,String name,String description,Map<String,Object> schema,String transport){this.serverName=serverName;this.url=url;this.headers=headers;this.name=name;this.description=description;this.schema=schema;this.transport=transport;}public String getServerName(){return serverName;}public String getUrl(){return url;}public Map<String,String> getHeaders(){return headers;}public String getName(){return name;}public String getDescription(){return description;}public Map<String,Object> getSchema(){return schema;}public String getTransport(){return transport;}}
}
