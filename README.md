# Orchestryx Backend

FastAPI backend for Orchestryx — a cloud-native cybersecurity lab platform built on AWS.

## Tech Stack

- **FastAPI** — REST API
- **PostgreSQL** — database (local Docker / AWS Aurora Serverless v2 in production)
- **AWS Cognito** — authentication (register, login, JWT)
- **SQLAlchemy** — ORM
- **Alembic** — database migrations
- **boto3** — AWS SDK

## Local Development

### Prerequisites
- Python 3.11+
- Docker

### 1. Start Postgres
```bash
docker run --name orchestryx-db -e POSTGRES_USER=orchestryx -e POSTGRES_PASSWORD=password -e POSTGRES_DB=orchestryx -p 5432:5432 -d postgres:16
```

### 2. Create virtual environment
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Fill in your values
```

### 4. Run the server
```bash
uvicorn app.main:app --reload
```

API docs available at: `http://localhost:8000/docs`

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AWS_REGION` | AWS region (eu-central-1) |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `COGNITO_APP_CLIENT_ID` | Cognito App Client ID |

## API Endpoints

### Auth
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login, returns JWT tokens | No |
| POST | `/auth/confirm` | Confirm email with verification code | No |
| POST | `/auth/refresh` | Refresh access token | No |

### General
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/health` | Health check | No |
| GET | `/me` | Get current user identity | Yes |

## Project Structure
```text
app/
├── api/            # Route handlers
├── middleware/     # JWT validation
├── models/         # SQLAlchemy DB models
├── services/       # Business logic (Cognito, etc.)
├── config.py       # Environment variables
├── database.py     # DB connection
└── main.py         # App entry point
```

## Progress

- [x] FastAPI setup
- [x] Postgres connection
- [x] User model
- [x] Cognito auth (register, login, confirm, refresh)
- [x] JWT middleware
- [ ] User → DB linking
- [ ] Lab templates
- [ ] Lab lifecycle (start, status, stop)
- [ ] Celery workers
- [ ] CDK lab stacks
