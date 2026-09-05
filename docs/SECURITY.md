# Security

## HTTP Access Boundary

| Flow            | Method                            | Where                        |
| --------------- | --------------------------------- | ---------------------------- |
| API Key storage | AES-256-GCM encryption            | Server-side repository layer |
| User sessions   | No auth (single-user desktop app) | N/A                          |

Mint's unauthenticated HTTP service is supported only on the local machine:

- Node, CLI, and Electron server startup bind to `127.0.0.1`.
- The official Docker Compose configuration publishes `127.0.0.1:3001:3001`.
- The Docker process listens on `0.0.0.0` only inside the container so Docker can forward the loopback-published host port; this does not make remote access supported.

CORS is a browser policy, not authentication, authorization, or a network access control. Do not publish Mint through a LAN address, public port, reverse proxy, host networking, or a custom `docker run -p` mapping.

## Authorization

Single-user desktop application. No multi-user authorization model. API keys are encrypted at rest using AES-256-GCM. The encryption key must be provided via environment variable at server startup.

Supporting LAN or public access requires a separate security change that first provides TLS/reverse-proxy deployment guidance, authentication, authorization, session and key lifecycle management, audit logging, rate limiting, and unauthorized-access tests.

## Secrets Management

- **Storage:** Environment variables for encryption keys and API credentials
- **Rotation:** Manual rotation policy — update environment variables and restart server
- **Access:** Only the application runtime reads secrets. Developers never see plaintext API keys.
- **Encryption:** All API keys stored in SQLite are encrypted. Decryption happens only at the repository layer.

## Threat Model

| Threat           | Mitigation                                | Status   |
| ---------------- | ----------------------------------------- | -------- |
| API key exposure | AES-256-GCM encryption at rest            | In place |
| SQL injection    | Parameterized queries via better-sqlite3  | In place |
| XSS              | React default escaping + CSP headers      | In place |
| CORS             | Configured for localhost development only | In place |
| Path traversal   | Input validation on file upload endpoints | In place |

## Dependencies

- Security-critical dependencies: `better-sqlite3` (parameterized queries), `jose` (JWT verification), `sharp` (image processing)
- Dependency update policy: Manual updates, review changelog for security patches

## Incident Response

- How to report: Open issue in repository with `security` label
- Escalation: Check `docs/SECURITY.md` for contact information
