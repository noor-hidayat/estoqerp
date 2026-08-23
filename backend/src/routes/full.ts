import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";

export const fullRouter = Router();

// GET /api/full
// Mengembalikan seluruh data dalam satu response (pola "fetch-all" yang
// dipakai frontend untuk mengisi DBProvider).
fullRouter.get("/full", async (req: Request, _res, next) => {
  const userId = req.user?.id;
  try {
  const [
    users,
    roles,
    rolePermissions,
    branchAccesses,
    branches,
    warehouses,
    locations,
    itemGroups,
    items,
    stockBalances,
    barcodeFormats,
    batchFormats,
    projects,
    scanSessions,
    scanRecords,
    opnameEntries,
    userSettings,
  ] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.roles),
    db.select().from(schema.rolePermissions),
    db.select().from(schema.branchAccesses),
    db.select().from(schema.branches),
    db.select().from(schema.warehouses),
    db.select().from(schema.locations),
    db.select().from(schema.itemGroups),
    db.select().from(schema.items),
    db.select().from(schema.stockBalances),
    db.select().from(schema.barcodeFormats),
    db.select().from(schema.batchFormats),
    db.select().from(schema.projects),
    db.select().from(schema.scanSessions),
    db.select().from(schema.scanRecords),
    db.select().from(schema.opnameEntries),
    userId
      ? db
          .select()
          .from(schema.userSettings)
          .where(eq(schema.userSettings.userId, userId))
      : Promise.resolve([]),
  ]);

  _res.json({
    users: users.map(({ passwordHash: _passwordHash, ...rest }) => rest),
    roles,
    rolePermissions,
    branchAccesses,
    branches,
    warehouses,
    locations,
    itemGroups,
    items,
    stockBalances,
    barcodeFormats,
    batchFormats,
    projects,
    scanSessions,
    scanRecords,
    opnameEntries,
    userSettings,
    seq: 0,
  });
  } catch (e) {
    next(e);
  }
});
