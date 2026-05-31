import time
from fastapi.testclient import TestClient


def _create_conversation(client: TestClient, title: str | None = None) -> dict:
    body = {}
    if title is not None:
        body["title"] = title
    resp = client.post("/api/conversations", json=body)
    assert resp.status_code == 201
    return resp.json()["conversation"]


class TestAC001_ConversationListEmpty:

    def test_empty_list_returns_empty_array(self, client: TestClient):
        resp = client.get("/api/conversations")
        assert resp.status_code == 200
        assert resp.json() == {"conversations": []}

    def test_response_content_type(self, client: TestClient):
        resp = client.get("/api/conversations")
        assert resp.headers["content-type"].startswith("application/json")

    def test_response_time_under_500ms(self, client: TestClient):
        start = time.time()
        client.get("/api/conversations")
        elapsed = (time.time() - start) * 1000
        assert elapsed < 500


class TestAC002_NewConversation:

    def test_create_with_title(self, client: TestClient):
        conv = _create_conversation(client, "Test Chat")
        assert "id" in conv
        assert conv["title"] == "Test Chat"
        assert "createdAt" in conv
        assert "updatedAt" in conv

    def test_create_without_title_auto_generates(self, client: TestClient):
        conv = _create_conversation(client)
        assert conv["title"] == "New Chat"

    def test_new_conversation_appears_in_list(self, client: TestClient):
        conv = _create_conversation(client, "List Test")
        resp = client.get("/api/conversations")
        ids = [c["id"] for c in resp.json()["conversations"]]
        assert conv["id"] in ids

    def test_non_string_title_returns_400(self, client: TestClient):
        resp = client.post("/api/conversations", json={"title": 123})
        assert resp.status_code == 400
        assert "error" in resp.json()

    def test_list_ordered_by_updated_at_desc(self, client: TestClient):
        c1 = _create_conversation(client, "First")
        time.sleep(0.01)
        c2 = _create_conversation(client, "Second")
        resp = client.get("/api/conversations")
        convs = resp.json()["conversations"]
        assert convs[0]["id"] == c2["id"]
        assert convs[1]["id"] == c1["id"]


class TestAC005_DeleteAndRename:

    def test_rename_returns_updated(self, client: TestClient):
        conv = _create_conversation(client, "Old Name")
        resp = client.patch(f"/api/conversations/{conv['id']}", json={"title": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["conversation"]["title"] == "New Name"

    def test_rename_reflected_in_list(self, client: TestClient):
        conv = _create_conversation(client, "Rename Me")
        client.patch(f"/api/conversations/{conv['id']}", json={"title": "Renamed"})
        resp = client.get("/api/conversations")
        match = [c for c in resp.json()["conversations"] if c["id"] == conv["id"]]
        assert match[0]["title"] == "Renamed"

    def test_rename_with_empty_title_returns_400(self, client: TestClient):
        conv = _create_conversation(client, "Test")
        resp = client.patch(f"/api/conversations/{conv['id']}", json={"title": ""})
        assert resp.status_code == 400

    def test_delete_returns_success(self, client: TestClient):
        conv = _create_conversation(client, "Delete Me")
        resp = client.delete(f"/api/conversations/{conv['id']}")
        assert resp.status_code == 200
        assert resp.json() == {"success": True}

    def test_deleted_conversation_removed_from_list(self, client: TestClient):
        conv = _create_conversation(client, "Gone")
        client.delete(f"/api/conversations/{conv['id']}")
        resp = client.get("/api/conversations")
        ids = [c["id"] for c in resp.json()["conversations"]]
        assert conv["id"] not in ids

    def test_delete_nonexistent_returns_404(self, client: TestClient):
        resp = client.delete("/api/conversations/nonexistent-id")
        assert resp.status_code == 404

    def test_rename_nonexistent_returns_404(self, client: TestClient):
        resp = client.patch("/api/conversations/nonexistent-id", json={"title": "New"})
        assert resp.status_code == 404


class TestAC006_ConversationMessages:

    def test_new_conversation_empty_messages(self, client: TestClient):
        conv = _create_conversation(client)
        resp = client.get(f"/api/conversations/{conv['id']}/messages")
        assert resp.status_code == 200
        assert resp.json() == {"messages": []}

    def test_nonexistent_conversation_returns_404(self, client: TestClient):
        resp = client.get("/api/conversations/nonexistent-id/messages")
        assert resp.status_code == 404


class TestAC004_Settings:

    def test_default_settings(self, client: TestClient):
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "apiUrl" in data
        assert "apiKeyMasked" in data

    def test_save_settings(self, client: TestClient):
        resp = client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test-key-12345",
            "modelId": "gpt-4o",
        })
        assert resp.status_code == 200
        assert resp.json() == {"success": True}

    def test_api_key_masked(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test-key-12345",
            "modelId": "gpt-4o",
        })
        resp = client.get("/api/settings")
        masked = resp.json()["apiKeyMasked"]
        assert "sk-" in masked
        assert "****" in masked
        assert "sk-test-key-12345" != masked

    def test_plaintext_api_key_not_in_response(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-secret-key-67890",
            "modelId": "gpt-4o",
        })
        resp = client.get("/api/settings")
        assert "sk-secret-key-67890" not in resp.text

    def test_invalid_api_url_returns_400(self, client: TestClient):
        resp = client.put("/api/settings", json={
            "apiUrl": "not-a-url",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
        })
        assert resp.status_code == 400

    def test_empty_api_key_returns_400(self, client: TestClient):
        resp = client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "",
            "modelId": "gpt-4o",
        })
        assert resp.status_code == 400

    def test_missing_api_key_returns_400(self, client: TestClient):
        resp = client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "",
            "modelId": "gpt-4o",
        })
        assert resp.status_code == 400

    def test_missing_api_url_returns_400(self, client: TestClient):
        resp = client.put("/api/settings", json={
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
        })
        assert resp.status_code == 400

    def test_settings_persist_across_reads(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://persist-test.com",
            "apiKey": "sk-persist-key",
            "modelId": "gpt-4o-mini",
        })
        resp1 = client.get("/api/settings")
        resp2 = client.get("/api/settings")
        assert resp1.json() == resp2.json()


class TestAC007_SystemPrompt:

    def test_default_system_prompt_empty(self, client: TestClient):
        resp = client.get("/api/settings")
        assert resp.json().get("systemPrompt") == ""

    def test_save_and_return_system_prompt(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
            "systemPrompt": "You are a helpful assistant.",
        })
        resp = client.get("/api/settings")
        assert resp.json()["systemPrompt"] == "You are a helpful assistant."

    def test_accept_empty_system_prompt(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
            "systemPrompt": "",
        })
        resp = client.get("/api/settings")
        assert resp.json()["systemPrompt"] == ""


class TestAC008_ThinkingMode:

    def test_default_thinking_mode_false(self, client: TestClient):
        resp = client.get("/api/settings")
        assert resp.json().get("thinkingMode") is False

    def test_save_and_return_thinking_mode_true(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
            "thinkingMode": True,
        })
        resp = client.get("/api/settings")
        assert resp.json()["thinkingMode"] is True

    def test_thinking_mode_false_persists(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
            "thinkingMode": False,
        })
        resp = client.get("/api/settings")
        assert resp.json()["thinkingMode"] is False

    def test_thinking_mode_and_system_prompt_persist(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
            "systemPrompt": "Be concise.",
            "thinkingMode": True,
        })
        resp = client.get("/api/settings")
        assert resp.json()["systemPrompt"] == "Be concise."
        assert resp.json()["thinkingMode"] is True


class TestAgents:

    def test_agents_endpoint(self, client: TestClient):
        resp = client.get("/api/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert "agents" in data
        agent_ids = [a["id"] for a in data["agents"]]
        assert "general" in agent_ids
        assert "weather" in agent_ids


class TestAPIResponseShape:

    def test_conversation_object_shape(self, client: TestClient):
        conv = _create_conversation(client, "Shape Test")
        for key in ("id", "title", "createdAt", "updatedAt"):
            assert key in conv

    def test_unsupported_method_returns_404_or_405(self, client: TestClient):
        resp = client.put("/api/conversations")
        assert resp.status_code in (404, 405)

    def test_malformed_json_returns_400(self, client: TestClient):
        resp = client.post("/api/conversations", content="not json", headers={"Content-Type": "application/json"})
        assert resp.status_code == 400


class TestNF002_APIKeySecurity:

    def test_api_key_encrypted_in_db(self, client: TestClient):
        import os
        import sqlite3
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-plaintext-check-key-12345",
            "modelId": "gpt-4o",
        })
        # Create independent connection to avoid threading issues
        db_path = os.environ["AI_CHAT_DB_PATH"]
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT value FROM settings WHERE key = 'apiKey'").fetchone()
        conn.close()
        stored = row["value"]
        # Should be hex format with colons: iv:tag:ciphertext
        assert ":" in stored
        assert len(stored) > 60
        # Should NOT be plaintext
        assert "sk-plaintext" not in stored


class TestSettingsBackwardCompatibility:

    def test_minimal_put_still_returns_all_fields(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
        })
        resp = client.get("/api/settings")
        data = resp.json()
        assert "systemPrompt" in data
        assert "thinkingMode" in data

    def test_all_fields_after_save_with_minimal_data(self, client: TestClient):
        client.put("/api/settings", json={
            "apiUrl": "https://api.openai.com",
            "apiKey": "sk-test",
            "modelId": "gpt-4o",
            "systemPrompt": "",
            "thinkingMode": False,
        })
        resp = client.get("/api/settings")
        data = resp.json()
        assert data["systemPrompt"] == ""
        assert data["thinkingMode"] is False
