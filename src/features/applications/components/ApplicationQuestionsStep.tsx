import { useFieldArray, useFormContext } from 'react-hook-form'
import { Hash, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { CreateApplicationFormValues } from '../applicationSchemas'

const MAX_QUESTIONS = 50

export function ApplicationQuestionsStep({ disabled }: { disabled?: boolean }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<CreateApplicationFormValues>()

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'questions',
  })

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-brand-text">
          Application Questions
        </h3>
        <p className="text-sm text-brand-muted">
          Optional. Add any application-specific questions and the answers used
          — up to {MAX_QUESTIONS} entries.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-brand-border bg-white p-3">
        <p className="text-sm text-brand-muted">
          {fields.length} question{fields.length === 1 ? '' : 's'} added
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || fields.length >= MAX_QUESTIONS}
          onClick={() => append({ question: '', answer: '' })}
        >
          <Plus className="h-4 w-4" />
          Add question
        </Button>
      </div>

      {fields.length > 0 && (
        <ul className="space-y-3">
          {fields.map((field, index) => {
            const qErr = errors.questions?.[index]
            return (
              <li
                key={field.id}
                className="rounded-md border border-brand-border bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-brand-muted">
                    <Hash className="h-3.5 w-3.5" /> Question {index + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                    aria-label={`Remove question ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  <Input
                    placeholder="Are you willing to relocate?"
                    disabled={disabled}
                    aria-invalid={!!qErr?.question}
                    {...register(`questions.${index}.question`)}
                  />
                  {qErr?.question && (
                    <p className="text-xs text-red-600">
                      {qErr.question.message}
                    </p>
                  )}
                  <Textarea
                    placeholder="Yes"
                    disabled={disabled}
                    aria-invalid={!!qErr?.answer}
                    {...register(`questions.${index}.answer`)}
                  />
                  {qErr?.answer && (
                    <p className="text-xs text-red-600">
                      {qErr.answer.message}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
