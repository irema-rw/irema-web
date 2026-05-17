const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();
const FieldValue = admin.firestore.FieldValue;

async function requireActiveAdmin(request) {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const callerSnap = await db.doc(`admin_users/${callerUid}`).get();
  if (!callerSnap.exists || callerSnap.data().isActive === false) {
    throw new HttpsError('permission-denied', 'Only active admins can perform this action.');
  }

  return { callerUid, caller: callerSnap.data() };
}

async function deleteQuery(collectionPath, field, operator, value) {
  const snap = await db.collection(collectionPath).where(field, operator, value).get();
  return deleteSnapshot(snap);
}

async function deleteSnapshot(snap) {
  if (snap.empty) return 0;

  let batch = db.batch();
  let count = 0;
  let batchCount = 0;
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    count += 1;
    batchCount += 1;
    if (batchCount === 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();
  return count;
}

async function deleteReviewReactionsForReviewIds(reviewIds) {
  if (!reviewIds.length) return 0;

  let total = 0;
  for (let i = 0; i < reviewIds.length; i += 10) {
    const chunk = reviewIds.slice(i, i + 10);
    const snap = await db.collection('review_reactions').where('reviewId', 'in', chunk).get();
    total += await deleteSnapshot(snap);
  }
  return total;
}

async function deleteDocIfExists(path) {
  const ref = db.doc(path);
  const snap = await ref.get();
  if (!snap.exists) return 0;
  await ref.delete();
  return 1;
}

async function deleteStoragePrefix(prefix) {
  try {
    const [files] = await bucket.getFiles({ prefix });
    if (!files.length) return 0;
    await Promise.all(files.map(file => file.delete().catch(() => null)));
    return files.length;
  } catch (err) {
    console.error(`Failed to delete storage prefix ${prefix}:`, err);
    return 0;
  }
}

async function deleteCompanyCascade(companyId) {
  const deleted = {};
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const reviewSnap = await db.collection('reviews').where('companyId', '==', companyId).get();
  const reviewIds = reviewSnap.docs.map(docSnap => docSnap.id);

  deleted.reviewReactions = await deleteReviewReactionsForReviewIds(reviewIds);
  deleted.reviews = await deleteSnapshot(reviewSnap);
  deleted.notifications = await deleteQuery('notifications', 'companyId', '==', companyId);
  deleted.claims = await deleteQuery('claims', 'companyId', '==', companyId);
  deleted.products = await deleteQuery('products', 'companyId', '==', companyId);
  deleted.stories = await deleteQuery('company_stories', 'companyId', '==', companyId);
  deleted.subscriptions = await deleteQuery('subscriptions', 'companyId', '==', companyId);
  deleted.enterpriseEnquiries = await deleteQuery('enterprise_enquiries', 'companyId', '==', companyId);
  deleted.payments = await deleteQuery('payments', 'companyId', '==', companyId);
  deleted.qrScans = await deleteQuery('qr_scans', 'companyId', '==', companyId);
  deleted.storageFiles = 0;
  deleted.storageFiles += await deleteStoragePrefix(`logos/${companyId}/`);
  deleted.storageFiles += await deleteStoragePrefix(`business-photos/${companyId}/`);
  deleted.storageFiles += await deleteStoragePrefix(`business-backgrounds/${companyId}/`);

  const dailySnap = await db.collection(`analytics_metrics/${companyId}/daily`).get();
  let dailyDeleted = 0;
  if (!dailySnap.empty) {
    const batch = db.batch();
    dailySnap.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
      dailyDeleted += 1;
    });
    await batch.commit();
  }
  deleted.analyticsDaily = dailyDeleted;
  deleted.analytics = await deleteDocIfExists(`analytics_metrics/${companyId}`);
  deleted.company = await deleteDocIfExists(`companies/${companyId}`);

  return {
    company: companySnap.exists ? { id: companySnap.id, ...companySnap.data() } : null,
    deleted,
  };
}

exports.deleteUserData = onCall(
  { region: 'us-central1', maxInstances: 10, timeoutSeconds: 300 },
  async (request) => {
    const { callerUid, caller } = await requireActiveAdmin(request);
    const targetUid = request.data?.uid;
    if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'uid is required.');
    }
    if (targetUid === callerUid) {
      throw new HttpsError('failed-precondition', 'You cannot delete your own account.');
    }

    const userSnap = await db.doc(`users/${targetUid}`).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    const deleted = {};
    const companySnap = await db.collection('companies').where('adminUserId', '==', targetUid).get();
    deleted.ownedBusinesses = 0;
    for (const companyDoc of companySnap.docs) {
      await deleteCompanyCascade(companyDoc.id);
      deleted.ownedBusinesses += 1;
    }

    const reviewSnap = await db.collection('reviews').where('userId', '==', targetUid).get();
    const reviewIds = reviewSnap.docs.map(docSnap => docSnap.id);
    deleted.reviewReactionsOnUserReviews = await deleteReviewReactionsForReviewIds(reviewIds);
    deleted.reviews = await deleteSnapshot(reviewSnap);
    deleted.reviewReactionsByUser = await deleteQuery('review_reactions', 'userId', '==', targetUid);
    deleted.reviewLimits = await deleteQuery('review_limits', 'userId', '==', targetUid);
    deleted.notificationsSent = await deleteQuery('notifications', 'userId', '==', targetUid);
    deleted.notificationsReceived = await deleteQuery('notifications', 'targetUserId', '==', targetUid);
    deleted.claimsByUserId = await deleteQuery('claims', 'userId', '==', targetUid);
    deleted.claimsByClaimant = await deleteQuery('claims', 'claimantUserId', '==', targetUid);
    deleted.supportChats = await deleteQuery('support_chats', 'userId', '==', targetUid);
    deleted.blogViews = await deleteQuery('blog_views', 'userId', '==', targetUid);
    deleted.blogLikes = await deleteQuery('blog_likes', 'userId', '==', targetUid);
    deleted.blogComments = await deleteQuery('blog_comments', 'userId', '==', targetUid);
    deleted.securityLogs = await deleteQuery('security_logs', 'userId', '==', targetUid);
    deleted.qrScans = await deleteQuery('qr_scans', 'userId', '==', targetUid);
    deleted.storageFiles = 0;
    deleted.storageFiles += await deleteStoragePrefix(`profiles/${targetUid}/`);
    deleted.storageFiles += await deleteStoragePrefix(`review-photos/users/${targetUid}/`);
    deleted.user = await deleteDocIfExists(`users/${targetUid}`);

    try {
      await auth.deleteUser(targetUid);
      deleted.authUser = 1;
    } catch (err) {
      if (err.code !== 'auth/user-not-found') {
        throw new HttpsError('internal', `Auth delete failed: ${err.message}`);
      }
      deleted.authUser = 0;
    }

    await db.collection('audit_logs').add({
      action: 'user_permanently_deleted',
      detail: `Permanently deleted user and related data: ${userData?.email || targetUid}`,
      adminEmail: caller.email || null,
      adminUid: callerUid,
      targetUid,
      targetEmail: userData?.email || null,
      deleted,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true, uid: targetUid, deleted };
  }
);

exports.deleteBusinessData = onCall(
  { region: 'us-central1', maxInstances: 10, timeoutSeconds: 300 },
  async (request) => {
    const { callerUid, caller } = await requireActiveAdmin(request);
    const companyId = request.data?.companyId;
    if (!companyId || typeof companyId !== 'string') {
      throw new HttpsError('invalid-argument', 'companyId is required.');
    }

    const { company, deleted } = await deleteCompanyCascade(companyId);

    await db.collection('audit_logs').add({
      action: 'biz_permanently_deleted',
      detail: `Permanently deleted business and related data: ${company?.companyName || company?.name || companyId}`,
      adminEmail: caller.email || null,
      adminUid: callerUid,
      companyId,
      deleted,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true, companyId, deleted };
  }
);
