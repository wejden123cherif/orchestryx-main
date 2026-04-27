import logging

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.lab_template import LabTemplate
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/catalog", tags=["catalog"])
logger = logging.getLogger(__name__)


@router.get("")
async def get_catalog(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all active lab templates.
    Used by the frontend to display the lab catalog.
    """
    try:
        result = await db.execute(
            select(LabTemplate).where(LabTemplate.is_active.is_(True))
        )
        templates = result.scalars().all()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading catalog")
        raise HTTPException(status_code=500, detail="Database query failed")

    return [
        {
            "id": t.id,
            "title": t.title,
            "category": t.category,
            "difficulty": t.difficulty,
            "description": t.description,
            "credits_cost": t.credits_cost,
            "ttl_hours": t.ttl_hours,
            "instance_type": t.instance_type,
        }
        for t in templates
    ]


@router.get("/{template_id}")
async def get_template(
    template_id: str = Path(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$",
    ),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a single lab template by ID.
    Used by the lab detail page.
    """
    try:
        result = await db.execute(
            select(LabTemplate).where(
                LabTemplate.id == template_id,
                LabTemplate.is_active.is_(True),
            )
        )
        template = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading lab template")
        raise HTTPException(status_code=500, detail="Database query failed")

    if template is None:
        raise HTTPException(status_code=404, detail="Lab template not found")

    return {
        "id": template.id,
        "title": template.title,
        "category": template.category,
        "difficulty": template.difficulty,
        "description": template.description,
        "credits_cost": template.credits_cost,
        "ttl_hours": template.ttl_hours,
        "instance_type": template.instance_type,
    }
