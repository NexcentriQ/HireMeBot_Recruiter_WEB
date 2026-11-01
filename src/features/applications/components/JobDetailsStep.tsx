import { Controller, useFormContext } from 'react-hook-form'
import { Briefcase, Building2, Link2, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  JOB_SOURCE_PRESETS,
  type CreateApplicationFormValues,
} from '../applicationSchemas'

export function JobDetailsStep({ disabled }: { disabled?: boolean }) {
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useFormContext<CreateApplicationFormValues>()

  const jobSourceOption = watch('jobSourceOption')

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-brand-text">Job Details</h3>
        <p className="text-sm text-brand-muted">
          Tell us where this application is being submitted.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="companyName" required>
            Company Name
          </Label>
          <Input
            id="companyName"
            placeholder="Amazon"
            startIcon={<Building2 className="h-4 w-4" />}
            disabled={disabled}
            aria-invalid={!!errors.companyName}
            {...register('companyName')}
          />
          {errors.companyName && (
            <p className="text-xs text-red-600">{errors.companyName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="jobTitle" required>
            Job Title
          </Label>
          <Input
            id="jobTitle"
            placeholder="Software Engineer"
            startIcon={<Briefcase className="h-4 w-4" />}
            disabled={disabled}
            aria-invalid={!!errors.jobTitle}
            {...register('jobTitle')}
          />
          {errors.jobTitle && (
            <p className="text-xs text-red-600">{errors.jobTitle.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="jobLink" required>
            Job Posting URL
          </Label>
          <Input
            id="jobLink"
            type="url"
            placeholder="https://www.amazon.jobs/en/jobs/123456"
            startIcon={<Link2 className="h-4 w-4" />}
            disabled={disabled}
            aria-invalid={!!errors.jobLink}
            {...register('jobLink')}
          />
          {errors.jobLink && (
            <p className="text-xs text-red-600">{errors.jobLink.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="jobLocation" required>
            Job Location
          </Label>
          <Input
            id="jobLocation"
            placeholder="Houston, TX"
            startIcon={<MapPin className="h-4 w-4" />}
            disabled={disabled}
            aria-invalid={!!errors.jobLocation}
            {...register('jobLocation')}
          />
          {errors.jobLocation && (
            <p className="text-xs text-red-600">{errors.jobLocation.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="jobSourceOption" required>
            Job Source
          </Label>
          <Controller
            name="jobSourceOption"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger id="jobSourceOption">
                  <SelectValue placeholder="Select a source" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_SOURCE_PRESETS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.jobSourceOption && (
            <p className="text-xs text-red-600">
              {errors.jobSourceOption.message}
            </p>
          )}
        </div>

        {jobSourceOption === 'Other' && (
          <div className="space-y-1.5">
            <Label htmlFor="jobSourceCustom" required>
              Other Source
            </Label>
            <Input
              id="jobSourceCustom"
              placeholder="e.g. University Career Fair"
              disabled={disabled}
              aria-invalid={!!errors.jobSourceCustom}
              {...register('jobSourceCustom')}
            />
            {errors.jobSourceCustom && (
              <p className="text-xs text-red-600">
                {errors.jobSourceCustom.message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
