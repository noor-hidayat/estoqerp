import 'dotenv/config';
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  // Wrap every existing project without a parent into its own opname_project
  const res = await client.query(`
    WITH inserted AS (
      INSERT INTO opname_projects (id, name, created_at, deadline, created_by)
      SELECT
        'PRJ-' || LPAD(ROW_NUMBER() OVER (ORDER BY p.created_at)::TEXT, 3, '0'),
        p.name,
        p.created_at,
        p.deadline,
        p.created_by
      FROM projects p
      WHERE p.project_id IS NULL
      RETURNING id, name
    )
    UPDATE projects p
    SET project_id = i.id
    FROM inserted i
    WHERE p.name = i.name AND p.project_id IS NULL;
  `);

  console.log('Migration complete. Rows updated:', res.rowCount);

  // If any projects still don't have a parent (unlikely), wrap them individually
  const orphans = await client.query(`
    SELECT id, name, created_at, deadline, created_by FROM projects WHERE project_id IS NULL
  `);

  for (const row of orphans.rows) {
    const nextId = await client.query(`SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 5) AS INT)), 0) + 1 AS next FROM opname_projects WHERE id LIKE 'PRJ-%'`);
    const id = `PRJ-${String(nextId.rows[0].next).padStart(3, '0')}`;
    await client.query(`INSERT INTO opname_projects (id, name, created_at, deadline, created_by) VALUES ($1,$2,$3,$4,$5)`, [id, row.name, row.created_at, row.deadline, row.created_by]);
    await client.query(`UPDATE projects SET project_id = $1 WHERE id = $2`, [id, row.id]);
    console.log('Wrapped orphan project', row.id, 'into', id);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
