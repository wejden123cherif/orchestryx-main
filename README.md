# Orchestryx Backend

FastAPI backend for Orchestryx — a cloud-native cybersecurity lab platform built on AWS.

## Tech Stack

- **FastAPI** — REST API
- **PostgreSQL** — database (local Docker / AWS Aurora Serverless v2 in production)
- **AWS Cognito** — authentication (register, login, JWT)
- **AWS SQS** — async task queue between API and Celery workers
- **Celery** — background workers for lab provisioning and teardown
- **SQLAlchemy** — ORM
- **Alembic** — database migrations
- **boto3** — AWS SDK
- **AWS CDK** — infrastructure as code for lab VPC provisioning

## Local Development

### Prerequisites
- Python 3.11+
- Docker
- AWS CLI configured (`aws configure`)

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

### 4. Run the API server
```bash
uvicorn app.main:app --reload
```

### 5. Run the Celery worker (separate terminal)
```bash
celery -A app.workers.celery_app worker --loglevel=info
```

API docs available at: `http://localhost:8000/docs`

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AWS_REGION` | AWS region (eu-central-1) |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `COGNITO_APP_CLIENT_ID` | Cognito App Client ID |
| `SQS_PROVISION_URL` | SQS queue URL for lab provisioning tasks |
| `SQS_DESTROY_URL` | SQS queue URL for lab teardown tasks |

## API Endpoints

### Auth
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login, returns JWT tokens | No |
| POST | `/auth/confirm` | Confirm email with verification code | No |
| POST | `/auth/refresh` | Refresh access token | No |

### General
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/health` | Health check | No |
| GET | `/me` | Get current user from DB | Yes |

### Catalog
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/catalog` | List all active lab templates | Yes |
| GET | `/catalog/{id}` | Get single lab template | Yes |

### Labs
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/labs/start` | Start a lab — dispatches SQS task | Yes |
| GET | `/labs/active` | List user's running labs | Yes |
| GET | `/labs/{id}/status` | Poll lab status | Yes |
| DELETE | `/labs/{id}` | Stop a lab | Yes |

## Project Structure

```text
app/
├── api/              # Route handlers
│   ├── auth.py       # Auth endpoints
│   ├── catalog.py    # Lab catalog endpoints
│   └── labs.py       # Lab lifecycle endpoints
├── middleware/        # JWT validation
├── models/            # SQLAlchemy DB models
│   ├── user.py
│   ├── lab_template.py
│   └── lab_instance.py
├── services/          # Business logic
│   ├── cognito.py
│   └── user.py
├── workers/           # Celery background tasks
│   ├── celery_app.py  # Celery + SQS config
│   ├── provision.py   # Lab provisioning task
│   └── destroy.py     # Lab teardown task
├── config.py          # Environment variables
├── database.py        # DB connection
├── seeds.py           # Lab template seed data
└── main.py            # App entry point
```

## AWS Services Used

| Service | Purpose |
|---|---|
| Amazon Cognito | User auth and JWT tokens |
| Amazon SQS | Task queue between API and Celery |
| Amazon EC2 | Lab challenge machines |
| Amazon VPC | Isolated network per lab session |
| AWS CDK + CloudFormation | Lab infrastructure provisioning |
| Amazon ECR | Private Docker image registry |
| AWS Secrets Manager | VPN keys and credentials |
| Amazon RDS Aurora | Production PostgreSQL database |

## Progress

- [x] FastAPI setup
- [x] Postgres connection
- [x] User model
- [x] Cognito auth (register, login, confirm, refresh)
- [x] JWT middleware
- [x] User linked to DB on first login
- [x] Lab template model + Juice Shop seed
- [x] GET /catalog + GET /catalog/{id}
- [x] Lab instance model
- [x] POST /labs/start
- [x] GET /labs/{id}/status
- [x] GET /labs/active
- [x] DELETE /labs/{id}
- [x] SQS queues created (eu-central-1)
- [x] Celery wired to SQS — messages confirmed reaching queue
- [ ] Celery worker consuming messages
- [ ] CDK lab stack (VPC + EC2 + WireGuard)
- [ ] Full end-to-end lab provisioning