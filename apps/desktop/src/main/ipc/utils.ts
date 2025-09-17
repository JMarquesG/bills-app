import { createHash } from 'node:crypto'

export function generateId(): string {
	return createHash('md5')
		.update(Date.now().toString() + Math.random().toString())
		.digest('hex')
		.substring(0, 8)
}


