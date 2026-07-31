package com.mint.server.wiki;

import com.mint.server.db.mapper.SqlMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for Wiki lifecycle and ingestion jobs. */
@Repository
public class WikiRepository {
    private final SqlMapper mapper;
    public WikiRepository(SqlMapper mapper) { this.mapper = mapper; }
    public List<Map<String,Object>> heatRows() { return mapper.wikiHeat(); }
    public List<Map<String,Object>> jobs(String status,int limit) { Map<String,Object> p=new HashMap<>();p.put("status",status);p.put("limit",limit);return mapper.wikiJobs(p); }
    public List<Map<String,Object>> job(String id) { return mapper.wikiJob(id); }
    /** Searches the Wiki FTS index. */
    public List<Map<String,Object>> search(String query) { return mapper.searchWiki(query); }
    public void cancel(String id) { mapper.cancelWikiJob(id); }
    public String configuredPath() { return mapper.wikiPath().stream().findFirst().map(r -> String.valueOf(r.get("value"))).orElse(null); }
    public void insertJob(String id,String fileName,int size,String payload,String now) { insertJob(id, "upload", null, fileName, size, payload, now); }
    public void insertJob(String id,String sourceType,String conversationId,String fileName,int size,String payload,String now) { Map<String,Object> p=new HashMap<>();p.put("id",id);p.put("sourceType",sourceType);p.put("conversationId",conversationId);p.put("fileName",fileName);p.put("size",size);p.put("payload",payload);p.put("now",now);mapper.insertWikiJob(p); }
    public List<Map<String,Object>> pendingJobs() { return mapper.pendingWikiJobs(); }
    public void updateJob(String id, String status, int progress, String step, String result, String error) {
        Map<String,Object> p=new HashMap<>(); p.put("id",id); p.put("status",status); p.put("progress",progress); p.put("step",step);
        p.put("result",result); p.put("error",error); p.put("now",Instant.now().toString()); mapper.updateWikiJob(p);
    }
    /** Indexes an uploaded Markdown source for immediate Wiki search. */
    public void indexMarkdown(String path, String title, String content) {
        String now = Instant.now().toString();
        String hash = hash(content);
        String sourceId = UUID.randomUUID().toString();
        Map<String,Object> source = new HashMap<>(); source.put("id",sourceId); source.put("path",path); source.put("hash",hash); source.put("sourceType","upload"); source.put("now",now); mapper.insertWikiSource(source);
        String pageId = UUID.randomUUID().toString();
        Map<String,Object> page = new HashMap<>(); page.put("id",pageId); page.put("path",path); page.put("title",title); page.put("hash",hash); page.put("sourceId",sourceId); page.put("now",now); mapper.insertWikiPage(page);
        Map<String,Object> document = new HashMap<>(); document.put("id",UUID.randomUUID().toString()); document.put("pageId",page.get("id")); document.put("sourcePath",path); document.put("title",title); document.put("heading",""); document.put("body",content); document.put("hash",hash); document.put("now",now); mapper.insertWikiSearchDocument(document); mapper.refreshWikiSearchDocument((String) document.get("id"));
        registerClaims(pageId, path, sourceId, content, now);
    }
    /** Registers durable claims and a knowledge event for one compiled page. */
    private void registerClaims(String pageId, String path, String sourceId, String content, String now) {
        for (String sentence : content.split("(?<=[。！？.!?])\\s+|\\n+")) {
            String claim = sentence.trim();
            if (claim.length() < 8 || claim.length() > 500) continue;
            String key = normalizeClaim(claim);
            List<Map<String,Object>> existing = mapper.wikiClaimsByKey(key);
            if (existing.isEmpty() || !pageId.equals(String.valueOf(existing.get(0).get("page_id")))) {
                Map<String,Object> p = new HashMap<>(); p.put("id",UUID.randomUUID().toString()); p.put("pageId",pageId); p.put("claimText",claim); p.put("normalizedKey",key); p.put("status","proposed"); p.put("confidence",0.7); p.put("importance",0.5); p.put("now",now); mapper.insertWikiClaim(p);
                event("claim", String.valueOf(p.get("id")), "proposed", 1.0, sourceId, path, "compiled page claim", now);
                if (!existing.isEmpty()) {
                    Map<String,Object> conflict = new HashMap<>(); conflict.put("id",existing.get(0).get("id")); conflict.put("status","contested"); conflict.put("supportDelta",0); conflict.put("now",now); mapper.updateWikiClaim(conflict);
                    event("claim", String.valueOf(existing.get(0).get("id")), "contradicted", -0.5, sourceId, path, "same normalized claim key from another page", now);
                }
            } else {
                Map<String,Object> p = new HashMap<>(); p.put("id",existing.get(0).get("id")); p.put("status","verified"); p.put("supportDelta",1); p.put("now",now); mapper.updateWikiClaim(p);
                event("claim", String.valueOf(existing.get(0).get("id")), "reinforced", 1.0, sourceId, path, "claim repeated in compiled page", now);
            }
        }
    }
    public void expireClaim(String id, String now) { mapper.expireWikiClaim(Map.of("id",id,"now",now)); event("claim",id,"expired",-1.0,null,null,"claim exceeded retention window",now); }
    public List<Map<String,Object>> lifecyclePages() { return mapper.lifecycleWikiPages(); }
    public List<Map<String,Object>> claimsByPage(String id) { return mapper.wikiClaimsByPage(id); }
    public void lifecycleRun() { String now=Instant.now().toString(); mapper.insertWikiLifecycleJob(Map.of("id",UUID.randomUUID().toString(),"now",now)); }
    private void event(String type,String objectId,String eventType,double delta,String sourceId,String sourcePage,String reason,String now) { Map<String,Object> p=new HashMap<>(); p.put("id",UUID.randomUUID().toString()); p.put("objectType",type); p.put("objectId",objectId); p.put("eventType",eventType); p.put("delta",delta); p.put("sourceId",sourceId); p.put("sourcePage",sourcePage); p.put("reason",reason); p.put("now",now); mapper.insertWikiKnowledgeEvent(p); }
    private String normalizeClaim(String value) { String normalized=value.toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", ""); return normalized.substring(0, Math.min(160, normalized.length())); }
    private String hash(String content) { try { byte[] value=MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)); StringBuilder result=new StringBuilder(); for(byte item:value) result.append(String.format("%02x",item)); return result.toString(); } catch(Exception error) { throw new IllegalStateException("Unable to hash Wiki content",error); } }
}
