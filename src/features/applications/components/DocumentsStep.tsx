import { useFormContext } from 'react-hook-form'
import { AlertTriangle, FileText, FileUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CreateApplicationFormValues } from '../applicationSchemas'

export function DocumentsStep({ disabled }: { disabled?: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateApplicationFormValues>()

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-brand-text">Documents</h3>
        <p className="text-sm text-brand-muted">
          Attach the resume (and optionally a cover letter) used for this
          application.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">
            File upload is not wired up yet (backend dependency).
          </p>
          <p className="text-xs text-amber-900/90">
            The Create Application API expects pre-existing object-store IDs
            (<code className="font-mono">documents.resumeObjectId</code> and{' '}
            <code className="font-mono">documents.coverLetterObjectId</code>).
            No upload or student-document-list endpoint exists in the current
            backend, so for now enter the numeric object IDs directly. A real
            upload button requires a backend route that returns a valid
            object ID.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="resumeObjectId" required>
            Resume (object ID)
          </Label>
          <Input
            id="resumeObjectId"
            inputMode="numeric"
            placeholder="1000000003"
            startIcon={<FileUp className="h-4 w-4" />}
            disabled={disabled}
            aria-invalid={!!errors.resumeObjectId}
            {...register('resumeObjectId')}
          />
          {errors.resumeObjectId && (
            <p className="text-xs text-red-600">
              {errors.resumeObjectId.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="coverLetterObjectId">
            Cover Letter (object ID)
          </Label>
          <Input
            id="coverLetterObjectId"
            inputMode="numeric"
            placeholder="Optional"
            startIcon={<FileText className="h-4 w-4" />}
            disabled={disabled}
            aria-invalid={!!errors.coverLetterObjectId}
            {...register('coverLetterObjectId')}
          />
          {errors.coverLetterObjectId && (
            <p className="text-xs text-red-600">
              {errors.coverLetterObjectId.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
