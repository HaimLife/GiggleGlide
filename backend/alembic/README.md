# Database Migrations

This directory contains Alembic database migrations for the GiggleGlide backend.

## Migration Files

- `001_initial_migration.py` - Creates all initial database tables (users, jokes, categories, etc.)
- `002_seed_data.py` - Seeds initial joke data and categories

## Running Migrations

### Setup Database

1. Ensure PostgreSQL is running and create the database:
```bash
createdb giggleglide
```

2. Set the database URL in your environment:
```bash
export DATABASE_URL="postgresql://username:password@localhost:5432/giggleglide"
```

### Run Migrations

To upgrade to the latest migration:
```bash
cd backend
alembic upgrade head
```

To upgrade to a specific migration:
```bash
alembic upgrade 001  # Initial schema only
alembic upgrade 002  # Including seed data
```

### Rollback Migrations

To downgrade one revision:
```bash
alembic downgrade -1
```

To downgrade to a specific revision:
```bash
alembic downgrade 001  # Keep schema, remove seed data
alembic downgrade base  # Remove all migrations
```

## Creating New Migrations

### Auto-generate from Model Changes

1. Make changes to models in `backend/database/models.py`
2. Generate migration:
```bash
alembic revision --autogenerate -m "Description of changes"
```

### Manual Migration

```bash
alembic revision -m "Description of changes"
```

## Migration Best Practices

1. **Always review auto-generated migrations** - Alembic may miss some changes or generate unnecessary operations
2. **Test migrations** - Run upgrade and downgrade on a test database
3. **Keep migrations atomic** - Each migration should do one logical change
4. **Add meaningful descriptions** - Use clear revision messages
5. **Handle data migrations carefully** - Consider existing data when modifying columns

## Testing Migrations

Run the migration tests:
```bash
cd backend
pytest tests/test_migrations/
```

## Common Issues

### Connection Errors

If you get connection errors, check:
- PostgreSQL is running: `pg_ctl status`
- Database exists: `psql -l`
- Connection string is correct in `alembic.ini` or `DATABASE_URL`

### Foreign Key Constraints

When adding foreign keys to existing tables with data:
1. First add the column as nullable
2. Populate the column with valid references
3. Then add the foreign key constraint

### Check Constraints

SQLite doesn't enforce all check constraints by default. Test with PostgreSQL in production-like environment.