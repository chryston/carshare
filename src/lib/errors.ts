import toast from 'react-hot-toast'

export class AppError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'AppError'
  }
}

export function toastError(err: unknown): void {
  toast.error(err instanceof Error ? err.message : 'An unexpected error occurred')
}
