import { ipcMain } from 'electron'
import { z } from 'zod'
import { client } from '@bills/db'
import { generateId } from './utils'

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  taxId: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal(''))
})

const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  taxId: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal(''))
})


// Get all clients
ipcMain.handle('client:getAll', async () => {
  try {
    const res = await client.query('SELECT id, name, email FROM client WHERE hidden IS NOT TRUE ORDER BY name ASC')
    return {
      clients: res.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email
      }))
    }
  } catch (error) {
    return { error: { code: 'GET_CLIENTS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Create client
ipcMain.handle('client:create', async (_e, input) => {
  try {
    const data = createClientSchema.parse(input)
    const id = generateId()
    await client.query(
      'INSERT INTO client (id, name, email, tax_id, address, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, current_timestamp, current_timestamp)',
      [id, data.name, data.email || null, data.taxId || null, data.address || null, data.phone || null]
    )
    return { ok: true, id }
  } catch (error) {
    return { error: { code: 'CREATE_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Client read/update
ipcMain.handle('client:get', async (_e, id: string) => {
  try {
    const validated = z.string().min(1).parse(id)
    const res = await client.query('SELECT id, name, email, tax_id, address, phone, created_at, updated_at FROM client WHERE id = $1', [validated])
    const row = res.rows[0] as any
    if (!row) return { error: { code: 'CLIENT_NOT_FOUND', message: 'Client not found' } }
    return { client: {
      id: row.id,
      name: row.name,
      email: row.email,
      taxId: row.tax_id,
      address: row.address,
      phone: row.phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }}
  } catch (error) {
    return { error: { code: 'GET_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('client:update', async (_e, input) => {
  try {
    const data = updateClientSchema.parse(input)
    await client.query(
      `UPDATE client SET name=$1, email=$2, tax_id=$3, address=$4, phone=$5, updated_at=current_timestamp WHERE id=$6`,
      [data.name, data.email || null, data.taxId || null, data.address || null, data.phone || null, data.id]
    )
    return { ok: true }
  } catch (error) {
    return { error: { code: 'UPDATE_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Hide client
ipcMain.handle('client:hide', async (_e, id: string) => {
  try {
    const validated = z.string().min(1).parse(id)
    await client.query('UPDATE client SET hidden = true, updated_at = current_timestamp WHERE id = $1', [validated])
    return { ok: true }
  } catch (error) {
    return { error: { code: 'HIDE_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Delete client
ipcMain.handle('client:delete', async (_e, id: string) => {
  try {
    const validated = z.string().min(1).parse(id)
    await client.query('DELETE FROM client WHERE id = $1', [validated])
    return { ok: true }
  } catch (error) {
    return { error: { code: 'DELETE_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})