# @devsync/database

The single place where DevSync talks to its database.

## Future responsibility

- The schema definition and its migrations.
- A generated, typed database client.
- Repository-style access helpers consumed by `apps/api`.

## Current state

Boundary only. No ORM, no schema, no migrations, and no database connection
exist yet. `apps/api` does not depend on this package.
