import os
import boto3
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql://orchestryx:vff2419cLn4BIQMGkHMo@orchestryx-db.cluster-cz86ciucmlhr.eu-central-1.rds.amazonaws.com:5432/orchestryx"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def check_labs():
    with SessionLocal() as session:
        # Check most recent lab instances
        result = session.execute(text("SELECT id, template_id, status, status_message, failure_reason, created_at FROM lab_instances ORDER BY created_at DESC LIMIT 10"))
        print("Recent Lab Instances:")
        for row in result:
            print(f"ID: {row[0]}, Template: {row[1]}, Status: {row[2]}, Message: {row[3]}, Failure: {row[4]}, Created: {row[5]}")
        
        # Check if there are any QUEUED labs
        result = session.execute(text("SELECT count(*) FROM lab_instances WHERE status = 'QUEUED'"))
        queued_count = result.scalar()
        print(f"\nTotal QUEUED labs: {queued_count}")

if __name__ == "__main__":
    check_labs()
