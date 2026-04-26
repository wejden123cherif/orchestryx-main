from dotenv import load_dotenv
import os

load_dotenv()

# Database
DATABASE_URL = os.getenv("DATABASE_URL")

# AWS
AWS_REGION = os.getenv("AWS_REGION")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")
SQS_PROVISION_URL = os.getenv("SQS_PROVISION_URL")
SQS_DESTROY_URL = os.getenv("SQS_DESTROY_URL")

# CDK
CDK_INFRA_PATH = os.getenv(
    "CDK_INFRA_PATH",
    r"C:\Work\dev\orchestryx\orchestryx-infra",
)
