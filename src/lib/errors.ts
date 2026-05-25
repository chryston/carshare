import toast from 'react-hot-toast'

export class AppError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export function toastError(err: unknown): void {
  toast.error(err instanceof Error ? err.message : 'An unexpected error occurred')
}
