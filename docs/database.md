# Database

LOCI uses PostgreSQL (Neon) for backend services.

---

## Tables

### users

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| email | varchar | Unique |
| password_hash | varchar | bcrypt |
| created_at | timestamp | |

### ai_logs

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| user_id | uuid | Foreign key → users |
| question | text | User's spoken question |
| response | text | AI-generated answer |
| zone | varchar | Zone active at time of query |
| created_at | timestamp | |

All AI interactions are logged. Logs are used for review and improvement of the knowledge base.