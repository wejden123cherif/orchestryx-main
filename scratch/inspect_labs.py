
import json
from sqlalchemy import create_engine, text

DB_URL = 'postgresql://orchestryx:vff2419cLn4BIQMGkHMo@orchestryx-db.cluster-cz86ciucmlhr.eu-central-1.rds.amazonaws.com:5432/orchestryx'
engine = create_engine(DB_URL)

query = """
SELECT id, template_id, status, secrets_key, ecs_private_ip 
FROM lab_instances 
ORDER BY started_at DESC 
LIMIT 5
"""

with engine.connect() as conn:
    result = conn.execute(text(query))
    rows = [dict(row._mapping) for row in result]
    print(json.dumps(rows, indent=2, default=str))
