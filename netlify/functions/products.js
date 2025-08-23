const axios = require("axios");
const {
  commonHeaders,
  getToken,
  getKiotVietToken,
  updateToken,
  project,
  retailer,
} = require("./shared");

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

// 🔥 Hàm lấy categoryId từ Firestore nếu `categoryId === null`
const getActiveCategoryId = async () => {
  try {
    const docRef = db.collection("categories").doc("[chock-men]-categories-2");
    const snapshot = await docRef.get();

    if (!snapshot.exists) return null;

    const data = snapshot.data()?.data || [];
    const activeCategory = data.find((category) => category.active === true);

    return activeCategory?.categoryId || null;
  } catch (error) {
    console.error("Error fetching categories:", error);
    return null;
  }
};

// 🔥 Hàm gọi API KiotViet
const callApi = async (token, params) => {
  const response = await axios.get("https://public.kiotapi.com/products", {
    headers: {
      Retailer: retailer,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    params,
  });
  const data = response.data;

  // Lọc inventories chỉ lấy branchId 26576
  if (Array.isArray(data.data)) {
    data.data = data.data.map((product) => {
      if (Array.isArray(product.inventories)) {
        product.inventories = product.inventories.filter(
          (inv) => inv.branchId === 26576
        );
      }
      return product;
    });
  } else if (Array.isArray(data.inventories)) {
    data.inventories = data.inventories.filter((inv) => inv.branchId === 26576);
  }

  return data;
};

// 🔥 Main Handler
exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: "",
    };
  }

  const {
    productName,
    isActive,
    orderBy,
    categoryId,
    branchIds,
    includeInventory,
    includePricebook,
    pageSize,
    currentItem,
  } = JSON.parse(event.body || "{}");

  let finalCategoryId = categoryId;

  try {
    // ✅ Nếu `categoryId === null`, lấy từ Firestore
    if (!categoryId) {
      finalCategoryId = await getActiveCategoryId();
    }

    // Nếu không tìm thấy `categoryId`, trả về lỗi
    if (!finalCategoryId) {
      return {
        statusCode: 400,
        headers: commonHeaders,
        body: JSON.stringify({ error: "No active category found" }),
      };
    }

    // ✅ Lấy token
    const token = await getToken(project);

    // ✅ Gọi API KiotViet
    const apiResponse = await callApi(token, {
      name: productName,
      isActive,
      orderBy,
      categoryId: productName !== "" ? null : finalCategoryId, // ✅ Dùng categoryId mới
      branchIds: [26576],
      includeInventory,
      includePricebook,
      pageSize,
      currentItem,
    });

    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify(apiResponse),
    };
  } catch (error) {
    let tokenData = null;

    // 🔥 Xử lý lỗi 401 (Token hết hạn)
    if (error.response && error.response.status === 401) {
      try {
        const newToken = await getKiotVietToken();
        tokenData = newToken;

        // Cập nhật token mới
        await updateToken(newToken);

        // Gọi lại API KiotViet
        const retryApiResponse = await callApi(newToken, {
          name: productName,
          isActive,
          orderBy,
          categoryId: productName !== "" ? null : finalCategoryId,
          branchIds: [26576],
          includeInventory,
          includePricebook,
          pageSize,
          currentItem,
        });

        return {
          statusCode: 200,
          headers: commonHeaders,
          body: JSON.stringify(retryApiResponse),
        };
      } catch (retryError) {
        return {
          statusCode: 500,
          headers: commonHeaders,
          body: JSON.stringify({
            error: `Error while retrying: ${retryError?.message}`,
            tokenData: tokenData,
            retryError: retryError?.response?.data,
          }),
        };
      }
    }

    // Trả về lỗi nếu không phải lỗi 401
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({
        error: `Error: ${error?.message}`,
        details: error?.response?.data,
      }),
    };
  }
};
