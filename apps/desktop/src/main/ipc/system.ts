import { ipcMain, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { z } from 'zod'

// Generic file picker for PDFs (used by bills)
ipcMain.handle('file:pickPdf', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Invoice PDF',
      properties: ['openFile'],
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled) return { canceled: true }
    return { canceled: false, path: result.filePaths[0] }
  } catch (error) {
    return { error: { code: 'PICK_PDF_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Read file as data URL for previewing selected PDFs
ipcMain.handle('file:toDataUrl', async (_e, path: string) => {
  try {
    const validatedPath = z.string().min(1).parse(path)
    const buf = await fs.readFile(validatedPath)
    const base64 = Buffer.from(buf).toString('base64')
    return { dataUrl: `data:application/pdf;base64,${base64}` }
  } catch (error) {
    return { error: { code: 'READ_FILE_DATAURL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('system:openPath', async (_, path: string) => {
  try {
    const validatedPath = z.string().min(1).parse(path)
    await shell.showItemInFolder(validatedPath)
    return { ok: true }
  } catch (error) {
    return { error: { code: 'OPEN_PATH_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

async function moveToTrash(filePath: string): Promise<boolean> {
  try {
    await shell.trashItem(filePath)
    return true
  } catch (error) {
    console.error('Failed to move to trash:', error)
    return false
  }
}

export { moveToTrash }
