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

  it('paginates applications', async () => {
    const page1 = await mockApi.listApplications({ page: 1, pageSize: 5 })
    expect(page1.items.length).toBeLessThanOrEqual(5)
    expect(page1.totalItems).toBeGreaterThan(0)
  })

  it('searches by company name case-insensitively', async () => {
    const r = await mockApi.listApplications({
      search: 'amazon',
      pageSize: 50,
    })
    expect(r.items.length).toBeGreaterThan(0)
    for (const item of r.items) {
      const hay = (
        item.companyName +
        ' ' +
        item.jobTitle +
        ' ' +
        item.studentName
      ).toLowerCase()
      expect(hay.includes('amazon')).toBe(true)
    }
  })

  it('creates an application using the real API shape', async () => {
    const students = await mockApi.getAssignedStudents()
    const before = await mockApi.listApplications({ page: 1, pageSize: 5 })
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
    const after = await mockApi.listApplications({ page: 1, pageSize: 5 })
    expect(after.totalItems).toBe(before.totalItems + 1)
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
