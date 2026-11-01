import { useFormContext } from 'react-hook-form'
import { useAssignedStudents } from '@/features/students/studentService'
import type { CreateApplicationFormValues } from '../applicationSchemas'

export function ApplicationReviewSummary() {
  const { watch } = useFormContext<CreateApplicationFormValues>()
  const students = useAssignedStudents()
  const values = watch()

  const student = (students.data ?? []).find(
    (s) => String(s.id) === values.studentId
  )

  const jobSource =
    values.jobSourceOption === 'Other'
      ? values.jobSourceCustom?.trim() || '(not set)'
      : values.jobSourceOption

  const items: Array<{ label: string; value: string }> = [
    {
      label: 'Student',
      value: student ? `${student.fullName} (${student.email})` : '(not set)',
    },
    { label: 'Company', value: values.companyName?.trim() || '(not set)' },
    { label: 'Job Title', value: values.jobTitle?.trim() || '(not set)' },
    { label: 'Job Source', value: jobSource || '(not set)' },
    { label: 'Resume ID', value: values.resumeObjectId || '(not set)' },
    {
      label: 'Cover Letter ID',
      value: values.coverLetterObjectId?.trim() || '— none —',
    },
  ]

  return (
    <section
      aria-label="Review"
      className="rounded-lg border border-brand-border bg-brand-bg/60 p-4"
    >
      <h4 className="text-sm font-semibold text-brand-text">Review</h4>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col">
            <dt className="text-xs font-medium uppercase tracking-wide text-brand-muted">
              {item.label}
            </dt>
            <dd className="text-sm text-brand-text">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
