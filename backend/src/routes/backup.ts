import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { parseBackup, type BackupStore } from '../backup.ts'

// /api/backup: download the signed-in user's whole account, or replace it with a backup.
export function createBackupRouter(store: BackupStore) {
  const router = Router()

  // GET /api/backup: income, categories, and transactions as one JSON document
  router.get('/', async (_req, res) => {
    res.json(await store.export(currentUser(res).id))
  })

  // POST /api/backup/restore { the backup }: replaces all of the user's data with the backup's.
  // The whole file is checked first; if anything is wrong, nothing changes.
  router.post('/restore', async (req, res) => {
    const backup = parseBackup(req.body)
    res.json(await store.restore(currentUser(res).id, backup))
  })

  return router
}
