export function isArchivedRecord(record) {
  return String(record?.status || '').trim().toLowerCase() === 'archived';
}

export function getNextArchiveAction(record, entityType) {
  const isArchived = isArchivedRecord(record);
  const entityLabel = entityType === 'business' ? 'Business' : 'User';
  const auditPrefix = entityType === 'business' ? 'biz' : 'user';

  return {
    nextStatus: isArchived ? 'active' : 'archived',
    label: `${isArchived ? 'Unarchive' : 'Archive'} ${entityLabel}`,
    progressLabel: `${isArchived ? 'Unarchiving' : 'Archiving'}...`,
    auditAction: `${auditPrefix}_${isArchived ? 'unarchived' : 'archived'}`,
  };
}

export function getUserStatusBadge(user) {
  if (isArchivedRecord(user)) return { label: 'Archived', className: 'red' };
  if ((user?.role || 'user') === 'company_admin') return { label: 'Company Admin', className: 'blue' };
  if ((user?.role || 'user') === 'admin') return { label: 'Admin', className: 'teal' };
  return { label: 'User', className: 'gray' };
}

export function getBusinessStatusBadge(business) {
  if (isArchivedRecord(business)) return { label: 'Archived', className: 'red' };
  if (business?.isVerified) return { label: 'Verified', className: 'green' };
  return { label: 'Unverified', className: 'yellow' };
}
