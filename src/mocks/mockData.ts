import type {
  AssignedStudent,
  JobApplication,
  RecruiterProfile,
} from '@/types/domain'

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

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export const SEED_APPLICATIONS: JobApplication[] = [
  {
    id: 'app-001',
    studentId: MOCK_STUDENTS[0].id,
    studentName: 'Rahul Sharma',
    companyName: 'Amazon',
    jobTitle: 'Software Engineer',
    jobLocation: 'Houston, TX',
    jobSource: 'LinkedIn',
    status: 'APPLIED',
    appliedDate: daysAgo(0),
    createdByRecruiterId: MOCK_RECRUITER.id,
  },
  {
    id: 'app-002',
    studentId: MOCK_STUDENTS[1].id,
    studentName: 'Priya Reddy',
    companyName: 'Microsoft',
    jobTitle: 'Backend Developer',
    jobLocation: 'Remote',
    jobSource: 'Company Careers',
    status: 'APPLIED',
    appliedDate: daysAgo(0),
    createdByRecruiterId: MOCK_RECRUITER.id,
  },
  {
    id: 'app-003',
    studentId: MOCK_STUDENTS[2].id,
    studentName: 'Arjun Patel',
    companyName: 'Google',
    jobTitle: 'SDE Intern',
    jobLocation: 'Mountain View, CA',
    jobSource: 'Handshake',
    status: 'APPLIED',
    appliedDate: daysAgo(1),
    createdByRecruiterId: MOCK_RECRUITER.id,
  },
  {
    id: 'app-004',
    studentId: MOCK_STUDENTS[0].id,
    studentName: 'Rahul Sharma',
    companyName: 'NVIDIA',
    jobTitle: 'Software Engineer',
    jobLocation: 'Santa Clara, CA',
    jobSource: 'LinkedIn',
    status: 'APPLIED',
    appliedDate: daysAgo(2),
    createdByRecruiterId: MOCK_RECRUITER.id,
  },
  {
    id: 'app-005',
    studentId: MOCK_STUDENTS[1].id,
    studentName: 'Priya Reddy',
    companyName: 'Meta',
    jobTitle: 'Software Engineer',
    jobLocation: 'Menlo Park, CA',
    jobSource: 'Indeed',
    status: 'APPLIED',
    appliedDate: daysAgo(3),
    createdByRecruiterId: MOCK_RECRUITER.id,
  },
]

// Expand to a realistic volume so pagination and filtering look alive.
const extraCompanies = [
  'Netflix',
  'Apple',
  'Stripe',
  'Shopify',
  'Oracle',
  'Salesforce',
  'Adobe',
  'Intel',
  'Cisco',
  'Uber',
  'Airbnb',
  'LinkedIn',
  'Snowflake',
  'Datadog',
  'Figma',
  'Twilio',
  'Palantir',
]
const extraTitles = [
  'Software Engineer',
  'Backend Developer',
  'Frontend Developer',
  'Full Stack Engineer',
  'Data Engineer',
  'SDE Intern',
  'Platform Engineer',
]
const extraLocations = [
  'Remote',
  'Austin, TX',
  'Seattle, WA',
  'New York, NY',
  'Boston, MA',
  'Chicago, IL',
]
const extraSources = [
  'LinkedIn',
  'Indeed',
  'Company Careers',
  'Glassdoor',
  'Handshake',
]

const expanded: JobApplication[] = []
for (let i = 0; i < 37; i++) {
  const student = MOCK_STUDENTS[i % MOCK_STUDENTS.length]
  expanded.push({
    id: `app-${(100 + i).toString()}`,
    studentId: student.id,
    studentName: student.fullName,
    companyName: extraCompanies[i % extraCompanies.length],
    jobTitle: extraTitles[i % extraTitles.length],
    jobLocation: extraLocations[i % extraLocations.length],
    jobSource: extraSources[i % extraSources.length],
    status: 'APPLIED',
    appliedDate: daysAgo(4 + Math.floor(i / 2)),
    createdByRecruiterId: MOCK_RECRUITER.id,
  })
}

SEED_APPLICATIONS.push(...expanded)
