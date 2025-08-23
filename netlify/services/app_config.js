const admin = require("firebase-admin");
const serviceAccount = require("../../portal-services-zalo-firebase-adminsdk-kni5o-4f5fde7cd9.json");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
  });
}

const db = admin.firestore();

const DB_APPS = "apps";

/**
 * Lấy thông tin app từ Firestore dựa trên project
 */
const getAppData = async (project) => {
  const appSnapshot = await db
    .collection(DB_APPS)
    .where("project", "==", project)
    .limit(1)
    .get();

  if (appSnapshot.empty) {
    throw new Error("App not found");
  }
  return appSnapshot.docs[0].data();
};

module.exports = {
  getAppData,
};
