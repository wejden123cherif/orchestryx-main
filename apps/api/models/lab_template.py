from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime
from sqlalchemy.sql import func
from apps.api.database import Base


class LabTemplate(Base):
    """
    Represents a lab template in the catalog.
    Each row is one type of lab available to users.
    We insert these manually. Runtime deployment is disabled until the next
    lab runtime is implemented.
    """

    __tablename__ = "lab_templates"

    # Unique slug used as primary key - e.g. "web-sqli-01"
    # Human-readable, used in API URLs and future runtime names
    id = Column(String, primary_key=True)

    # Display information shown in the catalog
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)       # Web, Network, DFIR, AD, Malware
    difficulty = Column(String, nullable=False)     # Beginner, Intermediate, Advanced
    description = Column(Text, nullable=False)      # Full description shown on lab detail page

    # Cost and timing
    credits_cost = Column(Integer, nullable=False, default=1)   # credits deducted on start
    ttl_hours = Column(Integer, nullable=False, default=2)       # hours before auto-destroy

    # Runtime image config
    # docker_image_uri: full ECR URI of the challenge container
    # e.g. "123456789.dkr.ecr.eu-central-1.amazonaws.com/sqli-lab:latest"
    docker_image_uri = Column(String, nullable=False)

    # Retained for schema compatibility with older rows. The removed per-lab
    # CDK app is no longer invoked by workers.
    cdk_stack_class = Column(String, nullable=False)

    # Retained for future runtime sizing decisions.
    instance_type = Column(String, nullable=False, default="t3.small")

    # Where the lab challenge should be reachable once a runtime exists.
    challenge_port = Column(Integer, nullable=False, default=3000)
    challenge_path = Column(String, nullable=False, default="/")

    # Whether this lab appears in the catalog
    # Set to False to hide a lab without deleting it
    is_active = Column(Boolean, nullable=False, default=True)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
