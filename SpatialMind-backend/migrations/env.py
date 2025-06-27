from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.models.database import Base

# Import all models so Alembic sees them
from app.models import dataset

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

EXCLUDE_TABLES = [
    "spatial_ref_sys",
    "geometry_columns",
    "geography_columns",
    "raster_columns",
    "raster_overviews",
    "topology",
    "layer",
    "node",
    "edge",
    "face",
    "relation",
    "pointcloud_formats",
    "addr",
    "addrfeat", 
    "bg",
    "county",
    "county_lookup",
    "countysub_lookup",
    "cousub",
    "direction_lookup",
    "edges",
    "faces", 
    "featnames",
    "geocode_settings",
    "geocode_settings_default",
    "loader_lookuptables",
    "loader_platform", 
    "loader_variables",
    "pagc_gaz",
    "pagc_lex",
    "pagc_rules",
    "place",
    "place_lookup",
    "secondary_unit_lookup",
    "state",
    "state_lookup", 
    "street_type_lookup",
    "tabblock",
    "tabblock10",
    "tabblock20",
    "tract",
    "tract10",
    "us_gaz",
    "us_lex", 
    "us_rules",
    "zcta5",
    "zip_lookup",
    "zip_lookup_all",
    "zip_lookup_base",
    "zip_state",
    "zip_state_loc",
    "bg10",
    "featnames_lookup",
    "zip_codes",
    "zip_codes_state",
]

def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in EXCLUDE_TABLES:
        return False
    if type_ == "sequence" and reflected and hasattr(object, 'column') and object.column is not None:
        return False
    return True

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
