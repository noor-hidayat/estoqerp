#!/usr/bin/env bash
# Setup PostgreSQL lokal + inisialisasi database stockopname.
#
# Langkah 1 (perlu sudo, sekali saja):
#   sudo bash scripts/setup-postgres-local.sh install
#
# Langkah 2 (tanpa sudo, bisa diulang):
#   bash scripts/setup-postgres-local.sh init
#
# Langkah 3 (opsional, tanpa sudo):
#   bash scripts/setup-postgres-local.sh verify
set -euo pipefail

DB_NAME="stockopname"
DB_USER="stockopname"
DB_PASS="stockopname"
PG_VERSION="16"

setup_backend_env() {
  if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
  fi
  if ! grep -q "DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" backend/.env; then
    # timpa baris DATABASE_URL (atau tambahkan jika belum ada)
    if grep -q "^DATABASE_URL=" backend/.env; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}|" backend/.env
    else
      echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" >> backend/.env
    fi
  fi
  echo "[env] backend/.env siap."
}

cmd_install() {
  echo "[install] Menambah repo PostgreSQL resmi + install..."
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
  sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  sudo apt-get update
  sudo apt-get install -y postgresql-${PG_VERSION} postgresql-client-${PG_VERSION}

  echo "[install] Menyalakan service..."
  sudo systemctl enable postgresql
  sudo systemctl start postgresql

  echo "[install] Membuat user + database..."
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || sudo -u postgres createdb -O ${DB_USER} ${DB_NAME}
  echo "[install] Selesai. User '${DB_USER}' / db '${DB_NAME}' dibuat."
}

cmd_init() {
  setup_backend_env
  echo "[init] Menjalankan migrasi drizzle..."
  npm run db:migrate
  echo "[init] Seed admin user..."
  npm run db:seed
}

cmd_verify() {
  PGPASSWORD="${DB_PASS}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -c "\dt" -c "\du"
}

case "${1:-}" in
  install) cmd_install ;;
  init)    cmd_init ;;
  verify)  cmd_verify ;;
  *)
    echo "Usage: $0 {install|init|verify}"
    echo "  install  - install PostgreSQL via apt (perlu sudo)"
    echo "  init     - isi backend/.env + migrasi + seed"
    echo "  verify   - cek tabel & role di database"
    exit 1
    ;;
esac
