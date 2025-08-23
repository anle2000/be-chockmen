const { schedule } = require("@netlify/functions");
const admin = require("firebase-admin");
const serviceAccount = require("../../portal-services-zalo-firebase-adminsdk-kni5o-4f5fde7cd9.json");
const { project, url_project, url_dev } = require("./shared");
const { fetchOrders } = require("../services/fetch_oders");
const {
  chunkArray,
  convertToVietnamTime,
  removeUndefinedFields,
} = require("../ultils/ultils");
const { getAppData } = require("../services/app_config");
const { sendZNS } = require("../services/send_zns");
const axios = require("axios");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
  });
}

const db = admin.firestore();
const db_status_order_kiot_viet = "status-order-kiot-viet";
const db_user_zalo = "user-zalo";

// ✅ Lấy danh sách đơn hàng hiện có
const getExistingOrders = async (docRef) => {
  try {
    const docSnapshot = await docRef.get();
    return docSnapshot.exists ? docSnapshot.data().lstAsync || [] : [];
  } catch (error) {
    console.error("❌ [LỖI] Lấy danh sách đơn hàng thất bại:", error);
    return [];
  }
};

// FORMAT DATE
function formatDate(dateString) {
  const date = new Date(dateString);

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
}

// 🛠 Lấy thông tin liên hệ của khách hàng
const getUserContacts = async (customerCodes) => {
  console.log("🔵 [INFO] Đang lấy thông tin liên hệ của khách hàng...");
  const userZaloRef = db.collection(db_user_zalo);
  const userMap = new Map();
  const chunks = chunkArray(customerCodes, 30);

  for (const chunk of chunks) {
    try {
      const usersSnapshot = await userZaloRef
        .where("code", "in", chunk)
        .where("project", "==", project)
        .get();
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        userMap.set(data.code, data.contactNumber || "");
      });
    } catch (error) {
      console.error("❌ [LỖI] Không thể lấy thông tin liên hệ:", error);
    }
  }
  return userMap;
};

// FORMAT NEW ORDER
const formatNewOrders = (orders, userMap, formattedNowDate) => {
  return orders.map((order) => {
    const contactNumber = userMap.get(order.customerCode) || "";
    return {
      code: order.code,
      customerCode: order.customerCode,
      customerName: order.customerName,
      contactNumber,
      productName: order.orderDetails
        .map((item) => item.productName)
        .join(", "),
      total: order.total,
      totalPayment: order.totalPayment,
      description: order.description ?? "",
      statusCode: order.status,
      status: true,
      statusZns: contactNumber ? true : false,
      statusZns_3: false,
      statusZns_4: false,
      asyncDate: convertToVietnamTime(formattedNowDate),
      purchaseDate: order.purchaseDate,
      tag: contactNumber ? "ZALO" : "TMDT",
    };
  });
};

// 🔄 Cập nhật Firestore
const updateFirestore = async (orders) => {
  console.log("🔵 [INFO] Bắt đầu cập nhật đơn hàng vào Firestore...");
  const docId = `[${project}]-${db_status_order_kiot_viet}-2`;
  const docRef = db.collection(db_status_order_kiot_viet).doc(docId);
  const existingOrders = await getExistingOrders(docRef);
  const existingOrderCodes = new Set(existingOrders.map((order) => order.code));

  const newOrders = orders.filter(
    (order) => !existingOrderCodes.has(order.code)
  );
  if (newOrders.length === 0) {
    console.log("🟡 [CẢNH BÁO] Không có đơn hàng mới để cập nhật.");
    return;
  }

  console.log(`🟢 [THÀNH CÔNG] Phát hiện ${newOrders.length} đơn hàng mới!`);

  const nowDate = new Date();
  nowDate.setHours(nowDate.getHours() + 7);
  const formattedNowDate = nowDate.toISOString().split("T")[0];

  const validCustomerCodes = newOrders
    .map((order) => order.customerCode)
    .filter(
      (code) =>
        typeof code === "string" && code.trim() !== "" && code.startsWith("KH")
    );

  console.log("🔵 [INFO] Đang tìm kiếm thông tin khách hàng...");
  const userMap = await getUserContacts(validCustomerCodes);
  let finalOrders = [
    ...existingOrders,
    ...formatNewOrders(newOrders, userMap, formattedNowDate),
  ];

  console.log("🔵 [INFO] Gọi API để lấy trạng thái cập nhật...");
  try {
    const response = await axios.get(
      `${url_project}/functions/status_order_after`
    );
    const statusData = response.data;

    finalOrders = finalOrders.map((order) => {
      const updatedOrder = { ...order };
      const matchedOrder3 = statusData.lstAsync_3.find(
        (item) => item.code === order.code
      );

      if (matchedOrder3) updatedOrder.statusZns_3 = matchedOrder3.statusZns_3;

      const matchedOrder4 = statusData.lstAsync_4.find(
        (item) => item.code === order.code
      );
      if (matchedOrder4) updatedOrder.statusZns_4 = matchedOrder4.statusZns_4;

      console.log(
        `🟢 [THÀNH CÔNG] Cập nhật trạng thái đơn hàng: #${order?.code}`
      );
      return updatedOrder;
    });
  } catch (error) {
    console.error("❌ [LỖI] Lấy trạng thái đơn hàng từ API thất bại:", error);
  }

  const appData = await getAppData(project);

  console.log("🔵 [INFO] Bắt đầu gửi ZNS cho khách hàng.....................");
  for (const order of finalOrders) {
    if (order.contactNumber) {
      if (order.statusCode === 3 && order.statusZns_3 === false) {
        try {
          if (appData.znsConfig?.actionZns_KiotViet?.status_3 === true) {
            await sendZNS("418670", appData, order.contactNumber, {
              order_code: order.code,
              name: order.customerName,
              date: formatDate(order.purchaseDate),
            });

            if (statusSendZNS?.status) {
              order.statusZns_3 = true;
              console.log(
                `📤 [GỬI ZNS] Đã gửi ZNS trạng thái 3 cho đơn hàng ${order.code}`
              );
            }

            order.statusZns_3 = true;
          }
        } catch (error) {
          console.error(
            `❌ [LỖI] Gửi ZNS thất bại cho đơn hàng ${order.code}:`,
            error.message
          );
        }
      }

      if (order.statusCode === 4 && order.statusZns_4 === false) {
        try {
          if (appData.znsConfig?.actionZns_KiotViet?.status_4 === true) {
            const statusSendZNS = await sendZNS(
              "418672",
              appData,
              order.contactNumber,
              {
                customer_name: order.customerName,
                order_code: order.code,
              }
            );

            if (statusSendZNS?.status) {
              order.statusZns_4 = true;
              console.log(
                `📤 [GỬI ZNS] Đã gửi ZNS trạng thái 4 cho đơn hàng ${order.code}`
              );
            }

            order.statusZns_4 = true;
          }
        } catch (error) {
          console.error(
            `❌ Gửi ZNS thất bại cho đơn hàng ${order.code}:`,
            error.message
          );
        }
      }
    }
  }

  // Cập nhật lại danh sách đơn hàng sau khi gửi ZNS
  finalOrders = finalOrders?.map((order) => ({
    ...order,
    statusZns_3: order.statusCode === 3 ? true : order.statusZns_3,
    statusZns_4: order.statusCode === 4 ? true : order.statusZns_4,
  }));

  console.log("🔄 [INFO] Cập nhật lại danh sách đơn hàng trong Firestore...");
  try {
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const existingData = docSnap.data();

      // Lấy danh sách cũ từ Firestore, nếu chưa có thì gán là []
      const lstAsync_1_old = existingData.lstAsync_1 || [];
      const lstAsync_3_old = existingData.lstAsync_3 || [];
      const lstAsync_4_old = existingData.lstAsync_4 || [];

      // Lọc đơn hàng mới chưa có trong danh sách cũ
      const new_lstAsync_1 = finalOrders.filter(
        (order) =>
          order.statusCode === 1 &&
          !lstAsync_1_old.some((o) => o.code === order.code)
      );

      const new_lstAsync_3 = finalOrders.filter(
        (order) =>
          order.statusCode === 3 &&
          !lstAsync_3_old.some((o) => o.code === order.code)
      );

      const new_lstAsync_4 = finalOrders.filter(
        (order) =>
          order.statusCode === 4 &&
          !lstAsync_4_old.some((o) => o.code === order.code)
      );

      // Cập nhật lại danh sách với cả dữ liệu cũ + dữ liệu mới
      await docRef.update({
        lstAsync_1: [...lstAsync_1_old, ...new_lstAsync_1].map(
          removeUndefinedFields
        ),
        lstAsync_3: [...lstAsync_3_old, ...new_lstAsync_3].map(
          removeUndefinedFields
        ),
        lstAsync_4: [...lstAsync_4_old, ...new_lstAsync_4].map(
          removeUndefinedFields
        ),
        statusAsync: [1, 3, 4], // Cái này vẫn giữ nguyên
      });
    }

    console.log(`🟢 [THÀNH CÔNG] Firestore cập nhật thành công!`);
  } catch (error) {
    console.error("❌ [LỖI] Cập nhật Firestore thất bại:", error);
  }
};

exports.handler = schedule("*/30 * * * *", async () => {
  console.log("🚀 [TASK] Bắt đầu đồng bộ hóa đơn hàng...");
  try {
    const orders = await fetchOrders();
    await updateFirestore(orders);
    console.log("✅ [TASK] Đồng bộ hóa đơn hàng hoàn tất!");
  } catch (error) {
    console.error("❌ [TASK] Đồng bộ hóa đơn hàng thất bại:", error);
  }
  return { statusCode: 200, body: "Synchronization task completed." };
});
