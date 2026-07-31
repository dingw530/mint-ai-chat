package com.mint.server.db.mapper;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** MyBatis SQL mapper used exclusively by the repository layer. */
@Mapper
public interface SqlMapper {
    @Select("SELECT id,title,type,created_at,updated_at,locked_agent,routing_mode FROM conversations ORDER BY updated_at DESC") List<Map<String,Object>> conversations();
    @Select("SELECT id,title,type,created_at,updated_at,locked_agent,routing_mode FROM conversations WHERE type=#{type} ORDER BY updated_at DESC") List<Map<String,Object>> conversationsByType(String type);
    @Select("SELECT id,title,type,created_at,updated_at,locked_agent,routing_mode FROM conversations WHERE id=#{id}") List<Map<String,Object>> conversation(String id);
    @Insert("INSERT INTO conversations(id,title,type,created_at,updated_at,locked_agent,routing_mode) VALUES(#{id},#{title},#{type},#{createdAt},#{updatedAt},#{lockedAgent},#{routingMode})") void insertConversation(Map<String,Object> p);
    @Update("UPDATE conversations SET title=#{title},updated_at=#{updatedAt} WHERE id=#{id}") int updateTitle(Map<String,Object> p);
    @Update("UPDATE conversations SET locked_agent=#{lockedAgent},updated_at=#{updatedAt} WHERE id=#{id}") int updateLockedAgent(Map<String,Object> p);
    @Delete("DELETE FROM conversations WHERE id=#{id}") int deleteConversation(String id);
    @Delete("DELETE FROM conversations") int deleteAllConversations();
    @Select("SELECT id,conversation_id,role,content,reasoning,image_data,created_at FROM messages WHERE conversation_id=#{id} ORDER BY created_at ASC") List<Map<String,Object>> messages(String id);
    @Select("SELECT role,content,reasoning FROM messages WHERE conversation_id=#{id} ORDER BY created_at ASC") List<Map<String,Object>> history(String id);
    @Insert("INSERT INTO messages(id,conversation_id,role,content,reasoning,image_data,created_at) VALUES(#{id},#{conversationId},#{role},#{content},#{reasoning},#{imageData},#{createdAt})") void insertMessage(Map<String,Object> p);
    @Select("SELECT id,message_id,block_index,kind,version,data_json,created_at,updated_at FROM message_ui_blocks WHERE message_id=#{messageId} ORDER BY block_index") List<Map<String,Object>> uiBlocks(String messageId);
    @Insert("INSERT INTO message_ui_blocks(id,message_id,block_index,kind,version,data_json,created_at,updated_at) VALUES(#{id},#{messageId},#{blockIndex},#{kind},#{version},#{dataJson},#{createdAt},#{updatedAt})") void insertUiBlock(Map<String,Object> p);
    @Select("SELECT kind,catalog_id,component_name,data_schema_version,data_schema,enabled FROM a2ui_component_registry WHERE kind=#{kind} AND enabled=1") List<Map<String,Object>> componentRegistration(String kind);

    @Insert("INSERT INTO token_usage(id,conversation_id,input_tokens,output_tokens,total_tokens,source,created_at) VALUES(#{id},#{conversationId},#{inputTokens},#{outputTokens},#{totalTokens},#{source},#{createdAt})") void insertTokenUsage(Map<String,Object> p);

    @Select("SELECT id,name,api_url,api_key,model_id,api_type,category,is_active,sort_order,created_at,updated_at FROM model_endpoints ORDER BY sort_order,created_at") List<Map<String,Object>> endpoints();
    @Select("SELECT id,name,api_url,api_key,model_id,api_type,category,is_active,sort_order,created_at,updated_at FROM model_endpoints WHERE is_active=1 AND category='text' LIMIT 1") List<Map<String,Object>> activeEndpoint();
    @Select("SELECT id,name,api_url,api_key,model_id,api_type,category,is_active,sort_order,created_at,updated_at FROM model_endpoints WHERE id=#{id}") List<Map<String,Object>> endpoint(String id);
    @Select("SELECT COUNT(*) FROM model_endpoints") int endpointCount();
    @Insert("INSERT INTO model_endpoints(id,name,api_url,api_key,model_id,api_type,category,is_active,sort_order,created_at,updated_at) VALUES(#{id},#{name},#{apiUrl},#{apiKey},#{modelId},#{apiType},#{category},#{active},#{sortOrder},#{createdAt},#{updatedAt})") void insertEndpoint(Map<String,Object> p);
    @Update("UPDATE model_endpoints SET name=#{name},api_url=#{apiUrl},model_id=#{modelId},api_type=#{apiType},category=#{category},updated_at=#{updatedAt} WHERE id=#{id}") int updateEndpoint(Map<String,Object> p);
    @Update("UPDATE model_endpoints SET name=#{name},api_url=#{apiUrl},api_key=#{apiKey},model_id=#{modelId},api_type=#{apiType},category=#{category},updated_at=#{updatedAt} WHERE id=#{id}") int updateEndpointWithKey(Map<String,Object> p);
    @Delete("DELETE FROM model_endpoints WHERE id=#{id}") int deleteEndpoint(String id);
    @Update("UPDATE model_endpoints SET is_active=0") void deactivateEndpoints();
    @Update("UPDATE model_endpoints SET is_active=1,updated_at=#{now} WHERE id=#{id}") void activateEndpoint(Map<String,Object> p);

    @Select("SELECT id,content,category,memory_key,memory_type,subject,confidence,importance,status,source_conversation_id,created_at,updated_at FROM memories WHERE status='active' AND (#{category} IS NULL OR #{category}=' ' OR category=#{category}) ORDER BY importance DESC,updated_at DESC") List<Map<String,Object>> memories(String category);
    @Select("SELECT id,content,category,memory_key,memory_type,subject,confidence,importance,status,source_conversation_id,created_at,updated_at FROM memories WHERE id=#{id}") List<Map<String,Object>> memory(String id);
    @Select("SELECT content,category,importance FROM memories WHERE status='active' AND content LIKE '%' || #{query} || '%' ORDER BY importance DESC LIMIT 8") List<Map<String,Object>> searchMemories(String query);
    @Insert("INSERT INTO memories(id,content,category,memory_key,memory_type,subject,confidence,importance,status,source_conversation_id,created_at,updated_at) VALUES(#{id},#{content},#{category},'general','semantic','user',0.5,0.5,'active',#{sourceConversationId},#{now},#{now})") void insertMemory(Map<String,Object> p);
    @Update("UPDATE memories SET content=#{content},category=#{category},updated_at=#{now} WHERE id=#{id}") void updateMemory(Map<String,Object> p);
    @Update("UPDATE memories SET status='deleted',updated_at=#{now} WHERE id=#{id}") void deleteMemory(Map<String,Object> p);
    @Insert("INSERT INTO memory_processing_jobs(id,conversation_id,status,attempts,available_at,created_at,updated_at) VALUES(#{id},#{conversationId},'pending',0,#{now},#{now},#{now}) ON CONFLICT(conversation_id) DO UPDATE SET status='pending',available_at=excluded.available_at,locked_at=NULL,error_message=NULL,updated_at=excluded.updated_at") void enqueueMemoryJob(Map<String,Object> p);
    @Select("SELECT id,conversation_id,status,attempts,available_at,locked_at,error_message,created_at,updated_at FROM memory_processing_jobs WHERE status='pending' AND available_at <= #{now} ORDER BY created_at LIMIT 1") List<Map<String,Object>> nextMemoryJob(String now);
    @Update("UPDATE memory_processing_jobs SET status='processing',attempts=attempts+1,locked_at=#{now},updated_at=#{now} WHERE id=#{id} AND status='pending'") int claimMemoryJob(Map<String,Object> p);
    @Update("UPDATE memory_processing_jobs SET status='completed',locked_at=NULL,error_message=NULL,updated_at=#{now} WHERE id=#{id}") void completeMemoryJob(Map<String,Object> p);
    @Update("UPDATE memory_processing_jobs SET status='failed',locked_at=NULL,error_message=#{error},updated_at=#{now} WHERE id=#{id}") void failMemoryJob(Map<String,Object> p);

    @Select("SELECT key,value FROM settings") List<Map<String,Object>> settings();
    @Insert("INSERT INTO settings(key,value) VALUES(#{key},#{value}) ON CONFLICT(key) DO UPDATE SET value=excluded.value") void saveSetting(Map<String,Object> p);
    @Update("UPDATE model_endpoints SET api_url=#{apiUrl},model_id=#{modelId},updated_at=#{now} WHERE is_active=1") void updateActiveSettings(Map<String,Object> p);
    @Update("UPDATE model_endpoints SET api_url=#{apiUrl},api_key=#{apiKey},model_id=#{modelId},updated_at=#{now} WHERE is_active=1") void updateActiveSettingsWithKey(Map<String,Object> p);
    @Select("SELECT value FROM settings WHERE key=#{key}") List<Map<String,Object>> setting(String key);

    @Select("SELECT id,name,description,type,system_prompt,tool_ids,available,error_message,mcp_server_ids,trigger_keywords,created_at,updated_at FROM agents ORDER BY created_at") List<Map<String,Object>> agents();
    @Insert("INSERT INTO agents(id,name,description,type,system_prompt,tool_ids,available,error_message,mcp_server_ids,trigger_keywords,created_at,updated_at) VALUES(#{id},#{name},#{description},#{type},#{systemPrompt},'[]',#{available},NULL,#{mcpIds},#{keywords},#{now},#{now})") void insertAgent(Map<String,Object> p);
    @Update("UPDATE agents SET name=#{name},description=#{description},type=#{type},system_prompt=#{systemPrompt},mcp_server_ids=#{mcpIds},trigger_keywords=#{keywords},available=#{available},updated_at=#{now} WHERE id=#{id}") void updateAgent(Map<String,Object> p);
    @Delete("DELETE FROM agents WHERE id=#{id}") void deleteAgent(String id);

    @Insert("INSERT INTO routing_logs(id,conversation_id,agent_id,confidence,method,latency_ms,message_preview,locked_agent,routing_mode,created_at) VALUES(#{id},#{conversationId},#{agentId},#{confidence},#{method},#{latencyMs},#{messagePreview},#{lockedAgent},#{routingMode},#{createdAt})") void insertRoutingLog(Map<String,Object> p);
    @Select("<script>SELECT id,conversation_id,agent_id,confidence,method,latency_ms,message_preview,locked_agent,routing_mode,created_at FROM routing_logs <where><if test=\"conversationId != null and conversationId != ''\">conversation_id=#{conversationId}</if></where> ORDER BY created_at DESC LIMIT #{limit} OFFSET #{offset}</script>") List<Map<String,Object>> routingLogs(Map<String,Object> p);

    @Select("SELECT value FROM settings WHERE key=#{key}") List<Map<String,Object>> bashSetting(String key);
    @Insert("INSERT INTO settings(key,value) VALUES(#{key},#{value}) ON CONFLICT(key) DO UPDATE SET value=excluded.value") void replaceBash(Map<String,Object> p);

    @Select("SELECT id,name,command,args,env,url,headers,status,error_message,created_at,updated_at FROM mcp_servers ORDER BY created_at") List<Map<String,Object>> mcpServers();
    @Insert("INSERT INTO mcp_servers(id,name,command,args,env,url,headers,status,error_message,created_at,updated_at) VALUES(#{id},#{name},'', '[]','{}',#{url},#{headers},'inactive',NULL,#{now},#{now})") void insertMcpServer(Map<String,Object> p);
    @Update("UPDATE mcp_servers SET name=#{name},url=#{url},headers=#{headers},updated_at=#{now} WHERE id=#{id}") int updateMcpServer(Map<String,Object> p);
    @Delete("DELETE FROM mcp_server_tools WHERE server_id=#{id}") void deleteMcpTools(String id);
    @Insert("INSERT INTO mcp_server_tools(id,server_id,name,description,input_schema,transport,enabled,created_at,updated_at) VALUES(#{id},#{serverId},#{name},#{description},#{inputSchema},#{transport},1,#{now},#{now})") void insertMcpTool(Map<String,Object> p);
    @Delete("DELETE FROM mcp_servers WHERE id=#{id}") void deleteMcpServer(String id);
    @Select("SELECT s.name AS server_name,s.url,s.headers,t.name,t.description,t.input_schema,t.transport FROM mcp_servers s JOIN mcp_server_tools t ON t.server_id=s.id WHERE t.enabled=1 AND s.url IS NOT NULL") List<Map<String,Object>> registeredMcpTools();
    @Select("SELECT name,description,input_schema,transport FROM mcp_server_tools WHERE server_id=#{id} AND enabled=1") List<Map<String,Object>> mcpTools(String id);

    @Select("SELECT id,path,title,status,access_count,confidence,importance,last_accessed_at,last_confirmed_at FROM wiki_pages ORDER BY access_count DESC,updated_at DESC") List<Map<String,Object>> wikiHeat();
    @Select("<script>SELECT id,file_name,file_size,file_count,status,progress,step,result,error,attempts,source_type,conversation_id,created_at,updated_at FROM ingestion_jobs <if test=\"status != null and status != ''\">WHERE status=#{status}</if> ORDER BY created_at DESC LIMIT #{limit}</script>") List<Map<String,Object>> wikiJobs(Map<String,Object> p);
    @Select("SELECT id,file_name,file_size,file_count,status,progress,step,result,error,attempts,source_type,conversation_id,payload,created_at,updated_at FROM ingestion_jobs WHERE id=#{id}") List<Map<String,Object>> wikiJob(String id);
    @Update("UPDATE ingestion_jobs SET status='cancelled',updated_at=datetime('now') WHERE id=#{id} AND status NOT IN ('completed','failed','cancelled')") void cancelWikiJob(String id);
    @Update("UPDATE ingestion_jobs SET status=#{status},progress=#{progress},step=#{step},result=#{result},error=#{error},locked_at=NULL,updated_at=#{now} WHERE id=#{id}") void updateWikiJob(Map<String,Object> p);
    @Select("SELECT id,file_name,file_size,payload,status,attempts FROM ingestion_jobs WHERE status IN ('queued','processing') ORDER BY created_at") List<Map<String,Object>> pendingWikiJobs();
    @Select("SELECT value FROM settings WHERE key='wikiPath'") List<Map<String,Object>> wikiPath();
    @Select("SELECT source_path,title,heading,body FROM wiki_search_documents_fts WHERE wiki_search_documents_fts MATCH #{query} LIMIT 8") List<Map<String,Object>> searchWiki(String query);
    @Insert("INSERT INTO ingestion_jobs(id,source_type,conversation_id,file_name,file_size,file_count,status,progress,step,payload,available_at,created_at,updated_at) VALUES(#{id},#{sourceType},#{conversationId},#{fileName},#{size},1,'queued',0,'等待处理',#{payload},#{now},#{now},#{now})") void insertWikiJob(Map<String,Object> p);
    @Insert("INSERT OR IGNORE INTO wiki_sources(id,path,content_hash,source_type,status,ingested_at,created_at,updated_at) VALUES(#{id},#{path},#{hash},#{sourceType},'ingested',#{now},#{now},#{now})") void insertWikiSource(Map<String,Object> p);
    @Insert("INSERT OR REPLACE INTO wiki_pages(id,path,title,content_hash,version,status,source_id,quality_score,confidence,importance,created_at,updated_at) VALUES(#{id},#{path},#{title},#{hash},1,'published',#{sourceId},0.8,0.8,0.5,#{now},#{now})") void insertWikiPage(Map<String,Object> p);
    @Select("SELECT id,path,title,content_hash,status,confidence,importance,last_confirmed_at,updated_at FROM wiki_pages WHERE status NOT IN ('deleted','superseded')") List<Map<String,Object>> lifecycleWikiPages();
    @Select("SELECT id,page_id,claim_text,normalized_key,status,confidence,importance,support_count,valid_to,last_confirmed_at,created_at,updated_at FROM wiki_claims WHERE page_id=#{pageId} ORDER BY updated_at DESC") List<Map<String,Object>> wikiClaimsByPage(String pageId);
    @Select("SELECT id,page_id,claim_text,normalized_key,status,confidence,importance,support_count,valid_to,last_confirmed_at,created_at,updated_at FROM wiki_claims WHERE normalized_key=#{key} AND status IN ('proposed','verified','contested') ORDER BY updated_at DESC") List<Map<String,Object>> wikiClaimsByKey(String key);
    @Insert("INSERT INTO wiki_claims(id,page_id,claim_text,normalized_key,status,confidence,importance,support_count,last_confirmed_at,created_at,updated_at) VALUES(#{id},#{pageId},#{claimText},#{normalizedKey},#{status},#{confidence},#{importance},1,#{now},#{now},#{now})") void insertWikiClaim(Map<String,Object> p);
    @Update("UPDATE wiki_claims SET status=#{status},support_count=support_count+#{supportDelta},last_confirmed_at=#{now},updated_at=#{now} WHERE id=#{id}") void updateWikiClaim(Map<String,Object> p);
    @Update("UPDATE wiki_claims SET status='expired',valid_to=#{now},updated_at=#{now} WHERE id=#{id} AND status IN ('proposed','verified','contested')") void expireWikiClaim(Map<String,Object> p);
    @Insert("INSERT INTO wiki_knowledge_events(id,object_type,object_id,event_type,delta,source_id,source_page,reason,created_at) VALUES(#{id},#{objectType},#{objectId},#{eventType},#{delta},#{sourceId},#{sourcePage},#{reason},#{now})") void insertWikiKnowledgeEvent(Map<String,Object> p);
    @Insert("INSERT INTO wiki_lifecycle_jobs(id,status,available_at,attempts,created_at,updated_at) VALUES(#{id},'completed',#{now},1,#{now},#{now})") void insertWikiLifecycleJob(Map<String,Object> p);
    @Insert("INSERT OR REPLACE INTO wiki_search_documents(id,page_id,source_path,title,heading,body,document_type,content_hash,updated_at) VALUES(#{id},#{pageId},#{sourcePath},#{title},#{heading},#{body},'chunk',#{hash},#{now})") void insertWikiSearchDocument(Map<String,Object> p);
    @Insert("INSERT INTO wiki_search_documents_fts(title,heading,body,source_path,document_id) SELECT title,heading,body,source_path,id FROM wiki_search_documents WHERE id=#{id}") void refreshWikiSearchDocument(String id);

    @Select("SELECT id,label,type,source_file,properties,created_at,updated_at FROM graph_nodes ORDER BY label") List<Map<String,Object>> graphNodes();
    @Select("SELECT id,label,type,source_file,properties,created_at,updated_at FROM graph_nodes WHERE id=#{id}") List<Map<String,Object>> graphNode(String id);
    @Select("SELECT id,label,type,source_file,properties,created_at,updated_at FROM graph_nodes WHERE label LIKE '%' || #{query} || '%' ORDER BY label") List<Map<String,Object>> searchGraphNodes(String query);
    @Select("SELECT id,source_id,relation,target_id,properties,source,created_at FROM graph_edges ORDER BY created_at") List<Map<String,Object>> graphEdges();
    @Select("SELECT id,source_id,relation,target_id,properties,source,created_at FROM graph_edges WHERE source_id=#{id} OR target_id=#{id}") List<Map<String,Object>> graphEdgesForNode(String id);
    @Insert("INSERT INTO graph_nodes(id,label,type,source_file,properties,created_at,updated_at) VALUES(#{id},#{label},#{type},#{sourceFile},#{properties},#{now},#{now})") void insertGraphNode(Map<String,Object> p);
    @Insert("INSERT INTO graph_edges(id,source_id,relation,target_id,properties,source,created_at) VALUES(#{id},#{sourceId},#{relation},#{targetId},#{properties},#{source},#{now})") void insertGraphEdge(Map<String,Object> p);
    @Delete("DELETE FROM graph_nodes WHERE id=#{id}") int deleteGraphNode(String id);
    @Delete("DELETE FROM graph_edges WHERE id=#{id}") int deleteGraphEdge(String id);
    @Select("<script>SELECT id,source_id,target_id,relation,evidence,confidence,candidate_score,source_page,target_page,status,review_note,created_at,reviewed_at FROM graph_edge_candidates <where><if test=\"status != null and status != ''\">status=#{status}</if></where> ORDER BY confidence DESC,created_at DESC</script>") List<Map<String,Object>> graphCandidates(String status);
    @Update("UPDATE graph_edge_candidates SET status=#{status},review_note=#{note},reviewed_at=#{now} WHERE id=#{id}") int reviewGraphCandidate(Map<String,Object> p);
    @Select("SELECT id,source_id,target_id,relation,evidence,confidence,candidate_score,source_page,target_page,status,review_note,created_at,reviewed_at FROM graph_edge_candidates WHERE id=#{id}") List<Map<String,Object>> graphCandidate(String id);
}
