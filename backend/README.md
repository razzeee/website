# Flathub website backend

This is the fastapi based backend for https://www.flathub.org
Not the backend for flathub itself. Go here, if you're looking for that https://github.com/flathub-infra/ is your best bet.

## Permission rules

Permission rules support destination-only matching and exact transitions. Destination-only
rules retain their existing behavior for added entries and bus-policy increases. Exact
transitions specify `before` and `value`; a null endpoint means absent, not a wildcard.
They can approve or reject additions, removals, and replacements such as read-write to
read-only filesystem access. Every changed entry needs approval coverage, and a matching
rejection takes precedence. Preview rules before saving or applying them to pending reviews.

## Development

### Prerequisites

- Docker
- Docker-compose

### Running

Start the database:

```bash
docker compose up
```

You need to seed the database:

```bash
curl -X POST localhost:8000/update
```

Additionally, you may want to update the statistics:

```bash
curl -X POST localhost:8000/update/stats
```

If you perform any transactions which need funds transferring to vendors
then you should:

```bash
curl -X POST localhost:8000/update/process-pending-transfers
```

If you change any files, the server should restart and you should be able to see the changes.

If you want to explore the endpoints, you can use the UI:
https://localhost:8000/docs

### Development

```bash
uv venv
uv sync
source .venv/bin/activate
```

This should allow code completion and type checking to work, if you setup the interpreter in your IDE.

### Accessing redis

You can use a redis tool of your choice to interact with the database.
Just connect to localhost:6379.

### Running smoke tests locally

Smoke tests are executed against non-production data for reproducibility. To
reproduce CI setup, first recreate the environment:

```

docker compose down -v
docker compose --env-file .env.ci up --build

```

After that finishes, execute the helper script:

```

bash tests/run_tests.sh

```

Or update the snapshots via:

```
bash tests/update_snapshots.sh
```

## How to make changes to the SQL database schema

Making a change to the database schema in `models.py` will require a database migration.

If you want to update the models, first make the change in `models.py` and then
prepare and run a migration. You should ensure that any model change is committed
along with its migration so that the two do not get out of sync.

Once you have made your `models.py` change:

1. Prepare your migration with:

   ```bash
   docker compose run backend alembic revision --autogenerate -m "Title of migration"
   ```

````

If the command ran successfully, a new file will be created under `alembic/versions`.

2. Run the migration after the file has been created via
   ```bash
   docker compose run backend alembic upgrade head
   ```
   This will update your local database.

## Coping with changes others have made

The docker file is set to run migrations when the `backend` container starts, so if you
pull changes and they contain migrations, you can either run step 2 above, or else
simply stop and restart the `backend` container.

## Resetting the database

If you encounter any issues with the database and migrations, then to save yourself time and frustration it might be better to reset your Docker environment with

```bash
docker compose down --volumes
```

After that, using `docker compose up` will download and give you a fresh start from the last working migration.

After these changes, it's possible that the endpoint will need an update. To do this, open another terminal session and run

```bash
curl -X POST localhost:8000/update
```

## Dependency changes

If there's an update in `pyproject.toml` or `uv.lock`, this means the dependencies have changed and the container needs to be rebuilt.

To do this, you run:

```bash
docker compose up --build
```

## Search

If you're running this locally, you can use http://localhost:7700/ to test the search.

### Manifest dependency index

`/dependencies` on the website searches module-name prefixes (case-insensitive)
or exact source URLs in published stable x86_64 **app manifest declarations**.
It does not establish installed contents, release versions, runtime dependencies,
or canonical package identities. Each match links to a retained manifest snapshot
and a numeric JSON pointer. Snapshot IDs remain available after refs change or
are withdrawn. There is no automatic snapshot pruning in this first version.

Apply the Alembic migration and populate the normal app catalog first. Run a small
pilot through the existing worker before enabling the daily full-catalog job:

```sh
docker compose exec backend python -c 'from app.worker import update_dependencies; update_dependencies.send(["org.gnome.Calculator", "org.gnome.TextEditor"])'
```

Pilot calls only update the specified catalog apps. They do not withdraw other
apps. `DEPENDENCY_INDEX_ENABLED=true` enables full collection at 04:30 in the
existing scheduler's timezone; it can also be queued with
`update_dependencies.send()`. The setting defaults to false. The worker needs
the same OSTree bindings and repository access already used by moderation.
The API never queues ingestion in response to a public search.

Collection only pulls the embedded manifest at an enumerated immutable commit.
Changed commits/parser versions are queued separately; missing/failed attempts
are retried by subsequent enumerations. Failed fetches keep previous snapshots
without renewing their collection timestamp. Jobs finishing after a newer ref
observation cannot replace its evidence. A failed enumeration never withdraws
refs. Refs not observed for two days are marked stale even if their last fetch
succeeded. Coverage counts describe observed catalog refs, not all possible
Flathub artifacts, and stale counts overlap other statuses.

API endpoints:

- `GET /dependencies?q=openssl&match=module&limit=25`
- `GET /dependencies?q=<full-source-url>&match=source`
- `GET /dependencies/snapshots/<id>`

`next_cursor` is bound to the query and uses a declaration-ID high-water mark.
New declarations do not enter later pages; withdrawn/replaced snapshots may
disappear during pagination. Start a new search to include new publications.
`complete` means the supported declaration structure was parsed, not that shipped
contents are known. Branch names stay branches; no filename-to-version guesses
or cross-ecosystem identity merging are performed. Source kinds such as patches
and extra-data stay explicitly typed. Name queries can match both a module row
and its individual source rows.

Before full rollout, measure pilot duration, missing/partial/error counts, table
sizes (`pg_total_relation_size` for the three `dependency*` tables), and query
plans (`EXPLAIN ANALYZE`). The name-prefix and SHA-256 exact-URL indexes avoid
adding a search service. Raw URLs are retained and equality checked after hashing.
Full snapshot JSON is retained in PostgreSQL; evaluate retention and transfer cost
against the actual catalog before increasing scope to other architectures.

PostgreSQL integration tests use isolated schemas in a disposable database:

```sh
DEPENDENCY_TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/postgres \
  uv run pytest tests/test_dependency_manifest.py tests/test_dependency_index.py tests/test_ostree_manifest.py
```

The CI PostgreSQL service runs these tests, including migration upgrade/downgrade,
atomic writes, failed refreshes, withdrawal, immutable reads across ref changes,
exact source matching, and pagination. Regenerate API bindings with the existing
`pnpm openapi-codegen` command after API schema changes.

## Stripe

If you want to use the parts of the backend which use Stripe, e.g. for testing vending
or other aspects of the UI which might need wallet access, then you will need to
launch the backend with Stripe credentials. Here is how to go about setting up a
suitable account with Stripe, and then preparing credentials for use.

### Setting up a development Stripe account

1. Visit <https://dashboard.stripe.com/login> and choose the "Sign-up" link.
2. Create an account and choose the US as your country.
3. Wait for the verification email and use it to verify your account.
4. Stripe will first ask you to activate payments - skip this.
5. Navigate to the 'Connect' page (it may be under a 'More' option).
6. Fill out the 'Complete your platform profile' section, with options:
   1. Select 'Other' and Continue
   2. Select 'From your platform's website or app' and Continue
   3. Select 'Both your platform's name and the seller/service provider's name' and Continue
   4. Select 'Your platform' and Continue, then Submit
7. Once that submits, click the 'Connect settings' link near the top of the page.
8. Scroll down to 'Branding' section:
   1. Complete the business name and icon fields.
   2. Remember to use the 'Save branding changes' button.
9. Navigate to the 'Payments' page and create a $100 top-up.
   1. This seeds the account balance with some buffer to cover pay outs.
   2. At time of writing, top-ups require using the API: <https://stripe.com/docs/api/topups/create>.
   3. Alternatively you can use the test card details from <https://stripe.com/docs/testing> to
      make a payment and wait for the amount to become available to pay out.

This account will now be usable for testing payment and application vending workflows in local development.

### Acquiring your Stripe keys

1. Return to 'Home' of the dashboard, and then ensure test mode is turned on
2. On the RHS there's a 'For developers' section, it should mention test mode
3. Click on the Publishable key to copy it, paste it into your notes.
   This is STRIPE_PUBLIC_KEY
4. Click on the Secret key once to reveal, and a second time to copy, paste it into your notes.
   This is STRIPE_SECRET_KEY

To acquire your webhook key, you can use the stripe CLI tool. Install it
and then run `stripe login` - complete the login in your browser and the CLI
should succeed. Next run `stripe listen` and it will give you your webhook secret.
This is STRIPE_WEBHOOK_KEY.

If you want webhooks to make it from the testing into the backend then run:

```bash
stripe listen --forward-to localhost:8000/wallet/webhook/stripe
```

### Running the website with the right keys

In the backend directory you can run `env STRIPE_PUBLIC_KEY=... STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_KEY=... docker compose up --build`

When everything has started, if you visit <http://localhost:8000/docs> you will
see mention of Stripe if things are working properly.
````
