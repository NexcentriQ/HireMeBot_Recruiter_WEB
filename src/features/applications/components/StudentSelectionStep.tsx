import { Controller, useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { useAssignedStudents } from '@/features/students/studentService'
import type { CreateApplicationFormValues } from '../applicationSchemas'

export function StudentSelectionStep({ disabled }: { disabled?: boolean }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<CreateApplicationFormValues>()
  const students = useAssignedStudents()

  if (students.isLoading) {
    return <LoadingState label="Loading assigned students…" />
  }
  if (students.isError) {
    return (
      <ErrorState
        title="Could not load students"
        description={students.error?.message}
        onRetry={() => students.refetch()}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-brand-text">
          Select Assigned Student
        </h3>
        <p className="text-sm text-brand-muted">
          Pick the student you are applying on behalf of. Only active students
          assigned to you are listed.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="studentId" required>
          Assigned Student
        </Label>
        <Controller
          name="studentId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={field.onChange}
              disabled={disabled}
            >
              <SelectTrigger
                id="studentId"
                aria-invalid={!!errors.studentId}
              >
                <SelectValue placeholder="Select an assigned student" />
              </SelectTrigger>
              <SelectContent>
                {!Array.isArray(students.data) || students.data.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-brand-muted">
                    No active students assigned.
                  </div>
                ) : (
                  students.data.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.fullName} ({s.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        />
        {errors.studentId && (
          <p className="text-xs text-red-600">{errors.studentId.message}</p>
        )}
      </div>
    </div>
  )
}
