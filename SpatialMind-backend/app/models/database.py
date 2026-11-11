import urllib.parse
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

logger = logging.getLogger(__name__)

def normalize_database_url(url: str) -> str:
    """
    Safely normalizes database connection strings for Render, Supabase, Neon, and PostGIS.
    - Converts legacy 'postgres://' to 'postgresql://'.
    - Handles unencoded special characters in passwords (e.g. '@', '#', '%')
      which would otherwise corrupt hostname parsing.
    - Detects Supabase direct connection IPv6 URLs and advises connection pooler.
    """
    if not url:
        return url
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]

    if "://" in url:
        scheme, rest = url.split("://", 1)
        if "@" in rest:
            # The last '@' reliably separates user:password from host[:port]/database
            creds, host_part = rest.rsplit("@", 1)
            if ":" in creds:
                username, password = creds.split(":", 1)
                clean_pass = urllib.parse.unquote_plus(password)
                encoded_password = urllib.parse.quote_plus(clean_pass)
                url = f"{scheme}://{username}:{encoded_password}@{host_part}"

    if "supabase.co" in url and "pooler" not in url:
        logger.warning(
            "DATABASE_URL is using direct Supabase hostname ('db.*.supabase.co'). "
            "Direct connections resolve to IPv6, which is unreachable on Render. "
            "Update DATABASE_URL in Render to use Supabase IPv4 Connection Pooler "
            "(e.g., 'postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres')."
        )

    return url

db_url = normalize_database_url(str(settings.DATABASE_URL))

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()