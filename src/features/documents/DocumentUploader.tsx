import { useId, useRef } from 'react'
import { CheckCircle2, FileText, Loader2, RotateCcw, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  FILE_INPUT_ACCEPT,
  MAX_DOCUMENT_BYTES,
  formatFileSize,
} from '@/lib/documentValidation'
import type { DocumentType } from '@/types/document'
import { useDocumentUpload, type UploadStatus } from './useDocumentUpload'

export interface DocumentUploaderProps {
  studentId: number | null
  documentType: DocumentType
  /** Called whenever the backend confirms a document is ready for this student. */
  onRegistered?: (objectId: number) => void
  /** Called when the user clears their selection. */
  onCleared?: () => void
  /** Optional id so the parent can wire an external label. */
  id?: string
  disabled?: boolean
  /** Displayed title inside the card. */
  title?: string
  /** Short description under the title. */
  description?: string
}

/**
 * Self-contained, type-agnostic uploader. Owns its own file input, state
 * machine, and progress display. The parent treats this as a black box
 * whose only external output is the numeric `objectId` of a registered
 * document, surfaced via `onRegistered`.
 */
export function DocumentUploader(props: DocumentUploaderProps) {
  const {
    studentId,
    documentType,
    onRegistered,
    onCleared,
    disabled,
    title,
    description,
  } = props

  const inputRef = useRef<HTMLInputElement | null>(null)
  const generatedId = useId()
  const inputId = props.id ?? `doc-uploader-${generatedId}`
  const progressId = `${inputId}-progress`

  const upload = useDocumentUpload({
    studentId,
    documentType,
    onRegistered,
  })

  function handleChoose() {
    inputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the native input value so re-selecting the same file re-triggers change.
    e.target.value = ''
    if (!file) return
    await upload.startUpload(file)
  }

  function handleClear() {
    upload.resetUpload()
    onCleared?.()
  }

  const label = title ?? `Upload ${upload.documentLabel}`
  const subtitle =
    description ??
    `PDF or DOCX — Maximum ${formatFileSize(MAX_DOCUMENT_BYTES)}`

  const noStudent = studentId == null
  const controlsDisabled = Boolean(disabled) || noStudent || upload.isBusy

  return (
    <div className="rounded-lg border border-brand-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-brand-text">{label}</h4>
          <p className="text-xs text-brand-muted">{subtitle}</p>
        </div>
        {upload.status === 'succeeded' || upload.status === 'alreadyExists' ? (
          <SuccessBadge status={upload.status} />
        ) : null}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        onChange={handleFileChange}
        disabled={controlsDisabled}
        aria-describedby={progressId}
      />

      {noStudent && (
        <p className="mt-3 text-xs text-amber-700">
          Select a student first to enable upload.
        </p>
      )}

      {upload.fileMeta && (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-brand-border bg-brand-bg/50 p-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-brand-text" title={upload.fileMeta.name}>
              {upload.fileMeta.name}
            </p>
            <p className="text-xs text-brand-muted">
              {formatFileSize(upload.fileMeta.size)}
            </p>
          </div>
          {upload.status === 'succeeded' && upload.objectId != null && (
            <span className="text-xs text-brand-muted">
              ID {upload.objectId}
            </span>
          )}
        </div>
      )}

      <ProgressRow
        status={upload.status}
        progress={upload.progress}
        progressId={progressId}
      />

      {upload.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          {upload.error.message}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {upload.status === 'idle' || upload.status === 'failed' ? (
          <Button
            type="button"
            variant="default"
            onClick={handleChoose}
            disabled={controlsDisabled}
          >
            <Upload className="h-4 w-4" />
            Choose {upload.documentLabel}
          </Button>
        ) : null}

        {(upload.status === 'succeeded' || upload.status === 'alreadyExists') && (
          <Button
            type="button"
            variant="outline"
            onClick={handleChoose}
            disabled={disabled || upload.isBusy}
          >
            <RotateCcw className="h-4 w-4" />
            Replace {upload.documentLabel}
          </Button>
        )}

        {upload.isBusy && (
          <Button
            type="button"
            variant="outline"
            onClick={upload.cancelUpload}
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        )}

        {upload.status === 'failed' && upload.error?.retryable && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void upload.retryUpload()}
          >
            <RotateCcw className="h-4 w-4" />
            {upload.error.needsFreshUrl ? 'Try again' : 'Retry registration'}
          </Button>
        )}

        {(upload.status === 'succeeded' ||
          upload.status === 'alreadyExists' ||
          upload.status === 'failed') && (
          <Button type="button" variant="ghost" onClick={handleClear}>
            Remove selection
          </Button>
        )}
      </div>
    </div>
  )
}

function SuccessBadge({ status }: { status: UploadStatus }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      <CheckCircle2 className="h-3 w-3" />
      {status === 'alreadyExists' ? 'Already on file' : 'Uploaded'}
    </span>
  )
}

function ProgressRow({
  status,
  progress,
  progressId,
}: {
  status: UploadStatus
  progress: number
  progressId: string
}) {
  const working =
    status === 'validating' ||
    status === 'hashing' ||
    status === 'checking' ||
    status === 'uploading' ||
    status === 'registering'

  if (!working && status !== 'succeeded' && status !== 'alreadyExists') {
    return null
  }

  const label =
    status === 'validating'
      ? 'Checking file…'
      : status === 'hashing'
        ? 'Preparing file…'
        : status === 'checking'
          ? 'Checking for duplicates…'
          : status === 'uploading'
            ? `Uploading… ${progress}%`
            : status === 'registering'
              ? 'Registering document…'
              : status === 'alreadyExists'
                ? 'This resume is already on file.'
                : 'Resume uploaded successfully.'

  const showBar = status === 'uploading'

  return (
    <div className="mt-3">
      <p className="text-xs text-brand-muted" aria-live="polite">
        {working ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {label}
          </span>
        ) : (
          label
        )}
      </p>
      {showBar && (
        <div
          id={progressId}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full bg-brand-blue transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
