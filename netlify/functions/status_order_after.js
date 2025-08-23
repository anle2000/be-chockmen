const admin = require("firebase-admin");
const axios = require("axios");
const { commonHeaders, project } = require("./shared");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      require("../../portal-services-zalo-firebase-adminsdk-kni5o-4f5fde7cd9.json")
    ),
  });
}

const db = admin.firestore();
const db_status_order_kiot_viet = "status-order-kiot-viet";
const docId = `[${project}]-${db_status_order_kiot_viet}-2`;

exports.handler = async function (event, context) {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: "",
    };
  }

  try {
    const docRef = db.collection(db_status_order_kiot_viet).doc(docId);
    const docSnapshot = await docRef.get({ source: "server" });

    if (!docSnapshot.exists) {
      return {
        statusCode: 404,
        headers: commonHeaders,
        body: JSON.stringify({ error: "Document không tồn tại." }),
      };
    }

    const data = docSnapshot.data();

    const matchedOrders1 = data.lstAsync_1
      .filter((item) => Number(item.statusCode) === 1)
      .map(({ code, statusZns }) => ({ code, statusZns }));

    const matchedOrders3 = data.lstAsync_3
      .filter((item) => Number(item.statusCode) === 3)
      .map(({ code, statusZns_3 }) => ({ code, statusZns_3 }));

    const matchedOrders4 = data.lstAsync_4
      .filter((item) => Number(item.statusCode) === 4)
      .map(({ code, statusZns_4 }) => ({ code, statusZns_4 }));

    const result = {
      lstAsync_1: matchedOrders1,
      lstAsync_3: matchedOrders3,
      lstAsync_4: matchedOrders4,
    };

    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify(result),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({ error: `Lỗi: ${error.message}` }),
    };
  }
};
