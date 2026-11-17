import { describe, expect, it } from 'vitest'
import { mockApi } from '../mockApi'

describe('mockApi', () => {
  it('returns a recruiter profile', async () => {
    const p = await mockApi.getRecruiterProfile()
    expect(p.role).toBe('RECRUITER')
    expect(p.isActive).toBe(true)
  })

  it('lists only active assigned students with numeric IDs', async () => {
    const s = await mockApi.getAssignedStudents()
    expect(s.length).toBeGreaterThan(0)
    expect(s.every((x) => x.isActive)).toBe(true)
    expect(s.every((x) => typeof x.id === 'number')).toBe(true)
  })

  it('creates an application using the real API shape', async () => {
    const students = await mockApi.getAssignedStudents()
    const created = await mockApi.createApplication({
      studentId: students[0].id,
      application: {
        jobTitle: 'Test Engineer',
        companyName: 'TestCo',
        jobLocation: 'Remote',
        jobLink: 'https://testco.com/jobs/1',
        jobSource: 'LinkedIn',
      },
      documents: { resumeObjectId: 1000000003 },
    })
    expect(created.success).toBe(true)
    expect(typeof created.applicationId).toBe('number')
  })

  it('rejects creation for an unassigned student', async () => {
    await expect(
      mockApi.createApplication({
        studentId: 999999999999,
        application: {
          jobTitle: 'X',
          companyName: 'Y',
          jobLocation: 'Z',
          jobLink: 'https://a.com',
          jobSource: 'LinkedIn',
        },
        documents: { resumeObjectId: 1 },
      })
    ).rejects.toThrow()
  })
})
