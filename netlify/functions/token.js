const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
const serviceAccount = require("../../portal-services-zalo-firebase-adminsdk-kni5o-4f5fde7cd9.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
  });
}

const db = admin.firestore();

const { commonHeaders } = require("./shared");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: "",
    };
  }

  try {
    // Lấy `project` từ body của POST request
    let body = {};
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
      return {
        statusCode: 400,
        headers: commonHeaders,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }
    // const project = body.project;
    const project = "chock-men";

    if (!project) {
      return {
        statusCode: 400,
        headers: commonHeaders,
        body: JSON.stringify({ error: "Missing project parameter" }),
      };
    }

    // Tìm document dựa trên `project` trong collection "oa-token"
    const snapshot = await db
      .collection("oa-token")
      .where("project", "==", project)
      .limit(1) // Chỉ lấy một document đầu tiên
      .get();

    // Kiểm tra nếu không có document nào
    if (snapshot.empty) {
      return {
        statusCode: 404,
        headers: commonHeaders,
        body: JSON.stringify({
          error: `No token found for project: ${project}`,
        }),
      };
    }

    // Lấy document đầu tiên từ snapshot
    const doc = snapshot.docs[0];
    const data = doc.data();

    // Trả về token của project
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({ token: data.token }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
