import {
  FileText,
  FlaskConical,
  GitCompareArrows,
  Inbox,
  LayoutDashboard,
  Mails,
  ScrollText,
  Settings,
  Sparkles,
  SquareCheck,
  type LucideIcon,
} from 'lucide-react';

export const routes = {
  overview: '/',
  inbox: '/inbox',
  emails: '/emails',
  email: (id: string) => `/emails/${id}`,
  analyses: '/analyses',
  analysis: (id: string) => `/analyses/${id}`,
  review: '/review',
  conflicts: '/conflicts',
  missing: '/missing-information',
  documents: '/documents',
  evaluations: '/evaluations',
  activity: '/activity',
  settings: '/settings',
} as const;

/** Which derived count, if any, a nav item shows as a badge. */
export type NavBadge = 'needsReview' | 'conflicts' | 'failed' | 'missing';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: NavBadge;
}

export interface NavGroup {
  label?: string;
  items: readonly NavItem[];
}

export const navigation: readonly NavGroup[] = [
  {
    items: [{ to: routes.overview, label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Email',
    items: [
      { to: routes.inbox, label: 'Email Inbox', icon: Inbox },
      { to: routes.emails, label: 'All Emails', icon: Mails },
      { to: routes.documents, label: 'Documents', icon: FileText },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: routes.analyses, label: 'AI Analyses', icon: Sparkles, badge: 'failed' },
      { to: routes.review, label: 'Review Queue', icon: SquareCheck, badge: 'needsReview' },
      { to: routes.conflicts, label: 'Conflicts', icon: GitCompareArrows, badge: 'conflicts' },
      { to: routes.missing, label: 'Missing Information', icon: FileText, badge: 'missing' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: routes.evaluations, label: 'Evaluations', icon: FlaskConical },
      { to: routes.activity, label: 'Activity Log', icon: ScrollText },
      { to: routes.settings, label: 'Settings', icon: Settings },
    ],
  },
];
