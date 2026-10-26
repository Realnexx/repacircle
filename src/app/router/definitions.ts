import type { WorkspaceRole } from '@/types/access'
export const workspaces: {
  role: WorkspaceRole
  label: string
  pages: { slug: string; title: string; description: string }[]
}[] = [
  {
    role: 'platform-admin',
    label: 'Platform administration',
    pages: [
      {
        slug: 'dashboard',
        title: 'Dashboard',
        description: 'Platform health and organization oversight.',
      },
      {
        slug: 'organizations',
        title: 'Organizations',
        description: 'Review the organizations on RepaCircle.',
      },
      { slug: 'users', title: 'Users', description: 'Manage platform accounts and access.' },
      { slug: 'support', title: 'Support', description: 'Review support requests and follow up.' },
      {
        slug: 'settings',
        title: 'Settings',
        description: 'Manage platform preferences and configuration.',
      },
    ],
  },
  {
    role: 'organizer',
    label: 'Organizer workspace',
    pages: [
      { slug: 'dashboard', title: 'Dashboard', description: 'A clear view of your community.' },
      {
        slug: 'groups',
        title: 'Groups',
        description: 'Organize rotating, random draw and pooled savings circles.',
      },
      { slug: 'members', title: 'Members', description: 'Manage the people in your community.' },
      {
        slug: 'contributions',
        title: 'Contributions',
        description: 'Track contribution schedules and commitments.',
      },
      {
        slug: 'payments',
        title: 'Payments',
        description: 'Review submitted contributions and payment evidence.',
      },
      {
        slug: 'payouts',
        title: 'Payouts',
        description: 'Review recipient selections and payout schedules.',
      },
      {
        slug: 'reports',
        title: 'Reports',
        description: 'Understand community activity and accountability.',
      },
      {
        slug: 'settings',
        title: 'Settings',
        description: 'Manage your organization and preferences.',
      },
    ],
  },
  {
    role: 'treasurer',
    label: 'Treasurer workspace',
    pages: [
      {
        slug: 'dashboard',
        title: 'Dashboard',
        description: 'Your collection and verification workspace.',
      },
      {
        slug: 'assigned-groups',
        title: 'Assigned Groups',
        description: 'Find the groups assigned to you.',
      },
      {
        slug: 'collections',
        title: 'Collections',
        description: 'Review expected and received contributions.',
      },
      {
        slug: 'verification',
        title: 'Verification',
        description: 'Review contribution evidence with care.',
      },
      {
        slug: 'reconciliation',
        title: 'Reconciliation',
        description: 'Compare collections with authoritative records.',
      },
    ],
  },
  {
    role: 'member',
    label: 'Member workspace',
    pages: [
      {
        slug: 'dashboard',
        title: 'Dashboard',
        description: 'Your community savings journey, in one place.',
      },
      { slug: 'my-groups', title: 'My Groups', description: 'Find the circles you belong to.' },
      {
        slug: 'my-contributions',
        title: 'My Contributions',
        description: 'Review your contribution schedule and history.',
      },
      {
        slug: 'my-payouts',
        title: 'My Payouts',
        description: 'View your scheduled rewards and distributions.',
      },
      {
        slug: 'notifications',
        title: 'Notifications',
        description: 'Stay informed about your community.',
      },
      { slug: 'profile', title: 'Profile', description: 'Your account and personal preferences.' },
    ],
  },
]
export const publicPages = [
  { path: '/', title: 'Community savings' },
  { path: '/privacy', title: 'Privacy Policy' },
  { path: '/terms', title: 'Terms and Conditions' },
  { path: '/help', title: 'Help & setup' },
  { path: '/design-system', title: 'Design system' },
]
export const authPages = [
  { path: '/login', title: 'Login' },
  { path: '/register', title: 'Register' },
  { path: '/forgot-password', title: 'Forgot Password' },
  { path: '/reset-password', title: 'Reset Password' },
  { path: '/verify-email', title: 'Verify email' },
  { path: '/auth/callback', title: 'Complete sign-in' },
]
export const workspacePaths = workspaces.flatMap((workspace) =>
  workspace.pages.map((page) => `/${workspace.role}/${page.slug}`),
)
