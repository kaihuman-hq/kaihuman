import { GITHUB_WORK_QUERIES } from '@kaihuman/palette';
import type { InboxReason } from './types.js';

export const INBOX_QUERIES: Record<InboxReason, string> = {
  'review-requested': GITHUB_WORK_QUERIES['review-requested'],
  assigned: GITHUB_WORK_QUERIES.assigned,
  failing: GITHUB_WORK_QUERIES.failing,
  'changes-requested': 'is:open is:pr archived:false author:@me review:changes_requested',
  'ready-to-merge': 'is:open is:pr archived:false author:@me review:approved status:success',
};

export const MY_OPEN_PRS_QUERY = 'is:open is:pr archived:false author:@me';
