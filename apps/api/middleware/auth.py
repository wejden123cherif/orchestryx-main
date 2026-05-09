"""
Cognito JWT authentication middleware for Orchestryx.

Key design decisions
--------------------
* JWKS are cached in-process with a configurable TTL (default 1 hour).
  Cognito rotates its signing keys periodically; without a TTL the old
  cached keys would cause all JWT validation to fail until the container
  restarted.

* On a JWTError the cache is invalidated and the JWKS are re-fetched once
  before giving up.  This handles the rare case where Cognito rotates keys
  mid-TTL and a valid token is rejected because the cached key is stale.

* The JWKS TTL is read from config so it can be tuned per environment
  without a code change (COGNITO_JWKS_TTL_SECONDS env var).
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from apps.api.config import AWS_REGION, COGNITO_APP_CLIENT_ID, COGNITO_JWKS_TTL_SECONDS, COGNITO_USER_POOL_ID

logger = logging.getLogger(__name__)

# FastAPI dependency — expects "Authorization: Bearer <token>" header.
bearer_scheme = HTTPBearer()

# Cognito publishes its public keys at this well-known URL.
JWKS_URL = (
    f"https://cognito-idp.{AWS_REGION}.amazonaws.com"
    f"/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
)
COGNITO_ISSUER = (
    f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
)


@dataclass
class _JwksCache:
    """Thread-safe-enough in-process JWKS cache with TTL.

    FastAPI runs in a single async event loop so there is no concurrent
    write risk here.  The dataclass is module-level so it survives across
    requests within the same process lifetime.
    """

    keys: dict[str, Any] | None = field(default=None)
    fetched_at: float = field(default=0.0)
    ttl_seconds: int = field(default=3600)

    def is_valid(self) -> bool:
        """Return True if the cached keys are present and not yet expired."""
        return (
            self.keys is not None
            and (time.monotonic() - self.fetched_at) < self.ttl_seconds
        )

    def invalidate(self) -> None:
        """Force the next call to re-fetch from Cognito."""
        self.keys = None
        self.fetched_at = 0.0

    def store(self, keys: dict[str, Any]) -> None:
        self.keys = keys
        self.fetched_at = time.monotonic()


# Module-level singleton — one cache per process.
_jwks_cache = _JwksCache(ttl_seconds=COGNITO_JWKS_TTL_SECONDS)


def _fetch_jwks() -> dict[str, Any]:
    """Fetch Cognito's public keys from the well-known endpoint.

    Raises HTTPException(503) if the endpoint is unreachable so callers
    receive a clear error rather than an unhandled exception.
    """
    try:
        response = requests.get(JWKS_URL, timeout=5)
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning(
            "Could not fetch Cognito JWKS from %s: %s",
            JWKS_URL,
            exc.__class__.__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable.",
        ) from exc


def get_jwks() -> dict[str, Any]:
    """Return cached JWKS, refreshing if the TTL has expired.

    This is the normal hot path — no network call unless the cache is stale.
    """
    if not _jwks_cache.is_valid():
        logger.debug("JWKS cache miss or expired — fetching from Cognito")
        keys = _fetch_jwks()
        _jwks_cache.store(keys)
    return _jwks_cache.keys  # type: ignore[return-value]


def _decode_token(token: str, jwks: dict[str, Any]) -> dict[str, Any]:
    """Decode and verify a Cognito JWT.  Raises JWTError on failure."""
    return jwt.decode(
        token,
        jwks,
        algorithms=["RS256"],
        issuer=COGNITO_ISSUER,
        options={"verify_at_hash": False},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    """FastAPI dependency — validates the JWT on every protected request.

    Returns the decoded token claims (user info) if the token is valid.
    Raises HTTP 401 if the token is missing, invalid, or expired.

    Refresh-on-failure behaviour
    ----------------------------
    If decoding fails with a JWTError the cache is invalidated and the JWKS
    are re-fetched once.  This handles the case where Cognito rotated its
    signing keys after the cache was populated but before the TTL expired.
    A second JWTError after the refresh is treated as a genuine invalid token
    and results in a 401.
    """
    token = credentials.credentials
    jwks = get_jwks()

    try:
        return _decode_token(token, jwks)
    except JWTError:
        # First attempt failed.  Invalidate the cache and try once more with
        # freshly fetched keys before giving up.
        logger.debug(
            "JWT decode failed with cached JWKS — invalidating cache and retrying"
        )
        _jwks_cache.invalidate()
        try:
            fresh_jwks = get_jwks()
            return _decode_token(token, fresh_jwks)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token.",
            )
