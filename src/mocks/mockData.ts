import type { AssignedStudent, RecruiterProfile } from '@/types/domain'

export const MOCK_RECRUITER: RecruiterProfile = {
  id: 'rec-001',
  email: 'recruiter@nexcentriq.com',
  fullName: 'Recruiter',
  role: 'RECRUITER',
  isActive: true,
}

export const MOCK_STUDENTS: AssignedStudent[] = [
  {
    id: 1_000_000_002,
    fullName: 'Rahul Sharma',
    email: 'rahul@example.com',
    isActive: true,
  },
  {
    id: 1_000_000_012,
    fullName: 'Priya Reddy',
    email: 'priya@example.com',
    isActive: true,
  },
  {
    id: 1_000_000_022,
    fullName: 'Arjun Patel',
    email: 'arjun@example.com',
    isActive: true,
  },
]
