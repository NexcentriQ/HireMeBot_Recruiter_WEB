import { useEffect, useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import { AlertTriangle } from 'lucide-react'
import { ResumeUploader } from '@/features/documents/ResumeUploader'
import type { CreateApplicationFormValues } from '../applicationSchemas'

/**
 * Step 3 of the Create Application wizard: attach documents.
 *
 * Only Resume is wired for V1. The uploader owns the full upload flow and
 * only exposes the registered `objectId` back to the form. The hidden form
 * field `resumeObjectId` is what the Zod schema validates against; it is
 * set from the uploader's `onRegistered` callback and cleared on removal.
 *
 * If the student changes after a resume has been uploaded, we reset the
 * stored id — a resume that belongs to another student must never slip
 * through into the create-application payload.
 */
export function DocumentsStep({ disabled }: { disabled?: boolean }) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<CreateApplicationFormValues>()

  const studentIdStr = watch('studentId')
  const studentId =
    studentIdStr && /^[0-9]+$/.test(studentIdStr)
      ? Number(studentIdStr)
      : null

  const lastStudentRef = useRef<string | null>(null)
  useEffect(() => {
    if (lastStudentRef.current !== null && lastStudentRef.current !== studentIdStr) {
      // Student swapped — any previously uploaded resumeObjectId belongs
      // to the old student and must not be reused.
      setValue('resumeObjectId', '', { shouldValidate: false })
    }
    lastStudentRef.current = studentIdStr
  }, [studentIdStr, setValue])

  function handleRegistered(objectId: number) {
    setValue('resumeObjectId', String(objectId), {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  function handleCleared() {
    setValue('resumeObjectId', '', {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-brand-text">Documents</h3>
        <p className="text-sm text-brand-muted">
          Upload the resume used for this application. The file is stored
          securely and only the resulting document ID is attached to the
          application.
        </p>
      </div>

      {studentId == null && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Select an assigned student in the previous step to enable upload.</p>
        </div>
      )}

      <ResumeUploader
        studentId={studentId}
        disabled={disabled}
        onRegistered={handleRegistered}
        onCleared={handleCleared}
      />

      {/*
        Keep the form value registered so the schema still validates on Next.
        The uploader is the only thing allowed to write to it, so we render
        it hidden.
      */}
      <input type="hidden" {...register('resumeObjectId')} />
      {errors.resumeObjectId && (
        <p className="text-xs text-red-600">{errors.resumeObjectId.message}</p>
      )}

      <p className="text-xs text-brand-muted">
        Cover letter uploads will be enabled in a future release.
      </p>
    </div>
  )
}
