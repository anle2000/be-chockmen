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

const db_categories = "categories";
const categoryDocId = "[chock-men]-categories-2";

// Hàm gọi API lấy danh mục
const callApi = async (token, params) => {
  const response = await axios.get("https://public.kiotapi.com/categories", {
    headers: {
      Retailer: retailer,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    params,
  });
  return response.data;
};

// Hàm lấy dữ liệu hiện tại từ Firestore
const getCurrentCategories = async () => {
  const docRef = db.collection(db_categories).doc(categoryDocId);
  const doc = await docRef.get();
  return doc.exists ? doc.data().data || [] : [];
};

// Hàm cập nhật Firestore nếu có thay đổi
const updateCategoriesIfNeeded = async (newCategories) => {
  const currentCategories = await getCurrentCategories();

  // Tạo danh sách mới, giữ lại 'images' nếu có
  const mergedCategories = newCategories.map((newCategory) => {
    const existingCategory = currentCategories.find(
      (c) => c.categoryId === newCategory.categoryId
    );

    return {
      ...newCategory,
      images: existingCategory?.images || "", // Giữ nguyên images nếu có
      active:
        existingCategory?.active !== undefined ? existingCategory.active : true,
    };
  });

  // Kiểm tra dữ liệu có thay đổi không
  if (JSON.stringify(currentCategories) !== JSON.stringify(mergedCategories)) {
    await db.collection(db_categories).doc(categoryDocId).set(
      {
        data: mergedCategories,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log("🔥 Categories updated with images preserved!");
  } else {
    console.log("✅ No changes, skipping update.");
  }
};

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: "",
    };
  }

  const { pageSize, currentItem } = JSON.parse(event.body || "{}");

  try {
    // Lấy token từ project
    let token = await getToken(project);

    // Gọi API lấy danh mục
    let apiResponse;
    try {
      apiResponse = await callApi(token, { pageSize, currentItem });
    } catch (error) {
      if (error.response && error.response.status === 401) {
        token = await getKiotVietToken();
        await updateToken(token);
        apiResponse = await callApi(token, { pageSize, currentItem });
      } else {
        throw error;
      }
    }

    const categories = apiResponse?.data || [];

    // Đồng bộ dữ liệu mới vào `data` nếu có thay đổi
    await updateCategoriesIfNeeded(categories);

    // 🟢 Lấy dữ liệu mới nhất từ Firestore
    const updatedCategories = (await getCurrentCategories()).filter(
      (category) => category.active === true
    );

    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({
        message: "Async data success!",
        status: 200,
        data: updatedCategories, // ✅ Trả về dữ liệu từ Firestore
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({ error: `Error: ${error?.message}` }),
    };
  }
};
