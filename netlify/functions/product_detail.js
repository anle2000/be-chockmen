const axios = require("axios");
const {
  commonHeaders,
  getToken,
  getKiotVietToken,
  updateToken,
  project,
  retailer,
} = require("./shared");

// Hàm gọi API chính
const callApi = async (token, params) => {
  const response = await axios.get(
    `https://public.kiotapi.com/products/code/${params?.code}`,
    {
      headers: {
        Retailer: retailer,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
};

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: "",
    };
  }

  const { code } = JSON.parse(event.body || "{}");

  try {
    // Lấy token từ project
    const token = await getToken(project);

    // Gọi API chính với token
    const apiResponse = await callApi(token, { code });

    // Lọc chỉ inventory branchId 26576
    let filteredInventory = null;
    if (Array.isArray(apiResponse.inventories)) {
      filteredInventory =
        apiResponse.inventories.find((inv) => inv.branchId === 26576) || null;
    }

    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({
        data: {
          ...apiResponse,
          inventories: filteredInventory ? [filteredInventory] : [],
        },
      }),
    };
  } catch (error) {
    // Kiểm tra lỗi 401 và xử lý lại
    if (error.response && error.response.status === 401) {
      try {
        const newToken = await getKiotVietToken();

        // Cập nhật token mới vào hệ thống
        await updateToken(newToken);

        // Gọi lại API chính với token mới
        const retryApiResponse = await callApi(newToken, { code });

        // Lọc chỉ inventory branchId 26576
        let retryFilteredInventory = null;
        if (Array.isArray(retryApiResponse.inventories)) {
          retryFilteredInventory =
            retryApiResponse.inventories.find(
              (inv) => inv.branchId === 26576
            ) || null;
        }

        return {
          statusCode: 200,
          headers: commonHeaders,
          body: JSON.stringify({
            data: {
              ...retryApiResponse,
              inventories: retryFilteredInventory
                ? [retryFilteredInventory]
                : [],
            },
          }),
        };
      } catch (retryError) {
        return {
          statusCode: 500,
          headers: commonHeaders,
          body: JSON.stringify({
            error: `Error while retrying: ${retryError?.message}`,
          }),
        };
      }
    }

    // Trả về lỗi nếu không phải lỗi 401
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({ error: `Error: ${error?.message}` }),
    };
  }
};
