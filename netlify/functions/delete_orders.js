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
const callApi = async (token, id) => {
  const response = await axios.delete(
    `https://public.kiotapi.com/orders/${id}?IsVoidPayment=true`,
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

  const requestBody = JSON.parse(event.body || "{}");
  const { id } = requestBody;

  if (!id) {
    return {
      statusCode: 400,
      headers: commonHeaders,
      body: JSON.stringify({ error: "Missing required parameter: id" }),
    };
  }

  try {
    // Lấy token từ project
    const token = await getToken(project);

    // Gọi API chính với token
    const apiResponse = await callApi(token, id);

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
        const retryApiResponse = await callApi(newToken, id); // Sửa lỗi tại đây

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
      body: JSON.stringify({ error: `Error: ${error?.message}` }),
    };
  }
};
