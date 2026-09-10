// Recreate the local admin after a wipe. LOCAL only.
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

const payload = await getPayload({ config })
const email = 'contact@sydevelopers.com'

const existing = await payload.find({
  collection: 'managers',
  where: { email: { equals: email } },
  limit: 1,
})
if (existing.docs.length) {
  console.log('admin already exists, id =', existing.docs[0].id)
} else {
  const m = await payload.create({
    collection: 'managers',
    data: { email, password: 'evk1VTH5dxz_nhg-mzk', name: 'Admin', type: 'admin' },
  })
  console.log('created manager id =', m.id, 'type =', m.type)
}
process.exit(0)
