import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBusinessStatusBadge,
  getNextArchiveAction,
  getUserStatusBadge,
  isArchivedRecord,
} from './adminModeration.js';

test('detects archived records by status', () => {
  assert.equal(isArchivedRecord({ status: 'archived' }), true);
  assert.equal(isArchivedRecord({ status: ' Archived ' }), true);
  assert.equal(isArchivedRecord({ status: 'active' }), false);
  assert.equal(isArchivedRecord({}), false);
});

test('returns archive or unarchive action copy', () => {
  assert.deepEqual(getNextArchiveAction({ status: 'active' }, 'user'), {
    nextStatus: 'archived',
    label: 'Archive User',
    progressLabel: 'Archiving...',
    auditAction: 'user_archived',
  });
  assert.deepEqual(getNextArchiveAction({ status: 'archived' }, 'business'), {
    nextStatus: 'active',
    label: 'Unarchive Business',
    progressLabel: 'Unarchiving...',
    auditAction: 'biz_unarchived',
  });
});

test('maps user and business status badges', () => {
  assert.deepEqual(getUserStatusBadge({ status: 'archived' }), { label: 'Archived', className: 'red' });
  assert.deepEqual(getUserStatusBadge({ role: 'company_admin' }), { label: 'Company Admin', className: 'blue' });
  assert.deepEqual(getBusinessStatusBadge({ status: 'archived', isVerified: true }), { label: 'Archived', className: 'red' });
  assert.deepEqual(getBusinessStatusBadge({ isVerified: true }), { label: 'Verified', className: 'green' });
});
