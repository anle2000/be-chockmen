const admin = require("firebase-admin");
const axios = require("axios");
const {
  getToken,
  getKiotVietToken,
  updateToken,
  retailer,
  commonHeaders,
  project,
} = require("./shared");

const serviceAccount = require("../../portal-services-zalo-firebase-adminsdk-kni5o-4f5fde7cd9.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
  });
}

const db = admin.firestore();

const DB_USER_ZALO = "user-zalo";
const DB_PAYMENT_WALLET = "payment-wallet";
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

/**
 * Gửi ZNS
 */
const sendZNS = async (appData, phone, templateData) => {
  if (appData.znsConfig?.actionZns_KiotViet?.status_1) {
    const payload = {
      project: appData.project,
      phone: phone?.replace(/^0/, "84"),
      template_id: "416158",
      app_id: appData.znsConfig.id_app,
      // mode: "development",
      template_data: templateData,
    };

    // console.log("----------payload", payload);

    try {
      const response = await axios.post(
        "https://data-portal-zalo-services.netlify.app/.netlify/functions/send_zns",
        payload
      );
      // console.log("----------response", response.data);

      return response.data;
    } catch (error) {
      console.log("ZNS API Error:", error.response?.data || error.message);
      throw new Error("Failed to send ZNS notification");
    }
  }
};

/**
 * Gọi API tạo đơn hàng trên KiotViet
 */
const orderKiotViet = async (data, token) => {
  try {
    const response = await axios.post(
      "https://public.kiotapi.com/orders",
      data,
      {
        headers: {
          Retailer: retailer,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `KiotViet API Error: ${error.response.status} - ${JSON.stringify(
          error.response.data
        )}`
      );
    } else {
      throw new Error(`Request Error: ${error.message}`);
    }
  }
};

/**
 * Lấy thông tin người dùng từ Firestore
 */
const getUserData = async (phone, project) => {
  if (!phone || !project) {
    throw new Error(
      "Missing required parameters: phone or project is undefined."
    );
  }

  const userSnapshot = await db
    .collection(DB_USER_ZALO)
    .where("phone", "==", phone)
    .where("project", "==", project)
    .limit(1)
    .get();

  if (userSnapshot.empty) {
    throw new Error("User not found");
  }
  return userSnapshot.docs[0];
};

/**
 * Cập nhật điểm thưởng và số vòng quay cho user
 */
const updateUserRewards = async (userDoc, total) => {
  const userData = userDoc.data();
  const newRewardPoints = (userData.rewardPoints || 0) + total;
  const newSpinWheelTotal = (userData.spinWheel?.total || 0) + 1;

  await db.collection(DB_USER_ZALO).doc(userDoc.id).update({
    rewardPoints: newRewardPoints,
    // 'spinWheel.total': newSpinWheelTotal,
  });
};

/**
 * Lấy thông tin ví điện tử của người dùng
 */
const getWalletData = async (phone, project) => {
  if (!phone || !project) {
    throw new Error(
      "Missing required parameters: phone or project is undefined."
    );
  }

  const walletSnapshot = await db
    .collection(DB_PAYMENT_WALLET)
    .where("phone", "==", phone)
    .where("project", "==", project)
    .limit(1)
    .get();

  if (walletSnapshot.empty) {
    throw new Error("Wallet not found");
  }
  return walletSnapshot.docs[0];
};

/**
 * Cập nhật số dư ví và lịch sử giao dịch
 */
const updateWallet = async (walletDoc, discount, contactNumber) => {
  const walletData = walletDoc.data();
  const newTotalPrice = (walletData.totalPrice || 0) - (discount || 0);

  const newTransHistory = [
    ...(walletData.transHistory || []),
    {
      amount: discount,
      phone: contactNumber,
      timeCreated: new Date().toISOString(),
      type: "ORDER",
    },
  ];

  await db.collection(DB_PAYMENT_WALLET).doc(walletDoc.id).update({
    totalPrice: newTotalPrice,
    transHistory: newTransHistory,
  });
};

/**
 * Xử lý chính của Lambda function
 */
exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: commonHeaders,
        body: "",
      };
    }

    const orderData = JSON.parse(event.body || "{}");
    if (!orderData || Object.keys(orderData).length === 0) {
      throw new Error("Invalid order data: No data provided.");
    }

    const { total, discount } = orderData;
    const { contactNumber } = orderData.orderDelivery;

    // Lấy dữ liệu app
    const appData = await getAppData(project);

    // Đặt hàng KiotViet
    let token = await getToken(project);
    let kiotVietResponse = null;

    try {
      kiotVietResponse = await orderKiotViet(orderData, token);
    } catch (error) {
      if (
        error.message.includes("KiotViet API Error") &&
        error.response?.status === 401
      ) {
        const newToken = await getKiotVietToken();
        await updateToken(newToken);
        token = newToken;
        kiotVietResponse = await orderKiotViet(orderData, token);
      } else {
        throw error;
      }
    }

    // Cập nhật thưởng và ví
    const userDoc = await getUserData(contactNumber, project);
    await updateUserRewards(userDoc, total);

    const walletDoc = await getWalletData(contactNumber, project);
    await updateWallet(walletDoc, discount ?? 0, contactNumber);

    // Gửi ZNS nếu cần
    const templateData = {
      customer_name: kiotVietResponse?.customerName,
      order_code: kiotVietResponse?.code,
      product_name: kiotVietResponse?.orderDetails
        ?.map((item) => item.productName)
        .join(", "),
      payment_status: "Đơn mới",
      payment_total: kiotVietResponse?.total?.toLocaleString("vi-VN") + "đ",
    };
    await sendZNS(appData, contactNumber, templateData);

    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({
        status: true,
        message: "Tạo mới đơn hàng thành công",
        data: kiotVietResponse,
      }),
    };
  } catch (error) {
    return {
      statusCode: error.response?.status || 500,
      headers: commonHeaders,
      body: JSON.stringify({
        error: error.message,
        details: error.response?.data || null,
      }),
    };
  }
};
