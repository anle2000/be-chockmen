const axios = require("axios");
const qs = require("qs");
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
  const queryString = qs.stringify(params, { arrayFormat: "repeat" });
  const response = await axios.get(
    `https://public.kiotapi.com/orders?${queryString}`,
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

  // Parse body và gán giá trị mặc định nếu không có
  const {
    lastModifiedFrom,
    toDate,
    customerCode,
    status = [], // Mảng số nguyên
    pageSize = 100,
    currentItem = 0,
    branchIds,
  } = JSON.parse(event.body || "{}");

  try {
    // Lấy token từ project
    const token = await getToken(project);

    // Gọi API chính với token
    const apiResponse = await callApi(token, {
      lastModifiedFrom,
      toDate,
      customerCode,
      status,
      pageSize,
      currentItem,
      branchIds: [26576],
    });

    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify(apiResponse),
    };
  } catch (error) {
    // Kiểm tra lỗi 401 và xử lý lại
    if (error.response && error.response.status === 401) {
      try {
        const newToken = await getKiotVietToken();

        // Cập nhật token mới vào hệ thống
        await updateToken(newToken);

        // Gọi lại API chính với token mới
        const retryApiResponse = await callApi(newToken, {
          lastModifiedFrom,
          toDate,
          customerCode,
          status,
          pageSize,
          currentItem,
          branchIds: [26576],
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
          }),
        };
      }
    }

    // Trả về lỗi nếu không phải lỗi 401
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({
        error: `Error out: ${error?.message + "---" + error.response.status}`,
      }),
    };
  }
};
