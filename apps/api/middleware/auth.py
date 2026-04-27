import logging

import requests
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from apps.api.config import AWS_REGION, COGNITO_USER_POOL_ID

logger = logging.getLogger(__name__)

# This tells FastAPI to expect "Authorization: Bearer <token>" header
bearer_scheme = HTTPBearer()

# Cognito publishes its public keys here — we use them to verify JWT signatures
JWKS_URL = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
COGNITO_ISSUER = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"

# Cache the public keys so we don't fetch them on every request
_jwks = None

def get_jwks():
    """
    Fetch Cognito's public keys.
    Cached after first call — keys rarely change.
    """
    global _jwks
    if _jwks is None:
        try:
            response = requests.get(JWKS_URL, timeout=5)
            response.raise_for_status()
            _jwks = response.json()
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Could not fetch Cognito JWKS: %s", exc.__class__.__name__)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable.",
            )
    return _jwks


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    """
    FastAPI dependency — validates the JWT token on every protected request.
    Returns the token claims (user info) if valid.
    Raises 401 if token is missing, invalid, or expired.
    """
    token = credentials.credentials

    try:
        # Get Cognito's public keys
        jwks = get_jwks()

        # Decode and verify the token
        claims = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            issuer=COGNITO_ISSUER,
            options={"verify_at_hash": False},
        )

        return claims

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token."
        )
