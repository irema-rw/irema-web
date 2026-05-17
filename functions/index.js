// Cloud Functions for Irema
//
// deleteAdminUser — callable function invoked from AdminAdministrators.jsx.
// It atomically deletes a Firebase Auth user AND the matching admin_users doc.
// Requires the caller to be an active admin themselves.
//
// Deploy:  firebase deploy --only functions -P staging    (then -P production)

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

/**
 * Delete an admin user.
 * Removes both the Firebase Auth account AND the admin_users Firestore document.
 * The target admin must be deactivated (isActive === false) first — matching the
 * UI flow of "Deactivate now, Delete later".
 *
 * @param {string} data.uid  — uid of the admin to remove
 */
exports.deleteAdminUser = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    // 1. Caller must be an active admin
    const callerSnap = await db.doc(`admin_users/${callerUid}`).get();
    if (!callerSnap.exists || callerSnap.data().isActive === false) {
      throw new HttpsError('permission-denied', 'Only active admins can delete admins.');
    }

    // 2. Validate input
    const targetUid = request.data?.uid;
    if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'uid is required.');
    }
    if (targetUid === callerUid) {
      throw new HttpsError('failed-precondition', 'You cannot delete your own admin account.');
    }

    // 3. Target must exist and be deactivated
    const targetSnap = await db.doc(`admin_users/${targetUid}`).get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'Target admin does not exist.');
    }
    const target = targetSnap.data();
    if (target.isActive !== false) {
      throw new HttpsError(
        'failed-precondition',
        'Deactivate the admin before deleting. This prevents accidental removal.'
      );
    }

    // 4. Delete Auth account (tolerate already-gone)
    try {
      await auth.deleteUser(targetUid);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') {
        throw new HttpsError('internal', `Auth delete failed: ${err.message}`);
      }
      // else: auth already gone — continue so we clean up Firestore
    }

    // 5. Delete Firestore doc
    await db.doc(`admin_users/${targetUid}`).delete();

    // 6. Audit log
    await db.collection('audit_logs').add({
      action: 'admin_deleted',
      detail: `Permanently deleted admin (Auth + Firestore): ${target.email || targetUid}`,
      adminEmail: callerSnap.data().email || null,
      adminUid: callerUid,
      targetUid,
      targetEmail: target.email || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, uid: targetUid, email: target.email || null };
  }
);

// Import and export analytics metrics functions
const analyticsMetrics = require('./calculateAnalyticsMetrics');
exports.calculateAnalyticsMetrics = analyticsMetrics.calculateAnalyticsMetrics;
exports.calculateAnalyticsMetricsManual = analyticsMetrics.calculateAnalyticsMetricsManual;

// Import and export Claude API proxy function
const claudeAPI = require('./callClaudeAPI');
exports.callClaudeAPI = claudeAPI.callClaudeAPI;

// Import and export newsletter sending function
const newsletter = require('./sendNewsletter');
exports.sendNewsletter = newsletter.sendNewsletter;

// Import and export admin moderation functions
const adminModeration = require('./adminModeration');
exports.deleteUserData = adminModeration.deleteUserData;
exports.deleteBusinessData = adminModeration.deleteBusinessData;
