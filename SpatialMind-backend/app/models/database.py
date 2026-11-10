import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

def normalize_database_url(url: str) -> str:
    """
    Safely normalizes database connection strings for Render, Supabase, Neon, and PostGIS.
    - Converts legacy 'postgres://' to 'postgresql://'.
    - Handles unencoded special characters in passwords (e.g. '@', '#', '%')
      which would otherwise corrupt hostname parsing.
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
                return f"{scheme}://{username}:{encoded_password}@{host_part}"
    return url

db_url = normalize_database_url(str(settings.DATABASE_URL))

engine = create_engine(db_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()