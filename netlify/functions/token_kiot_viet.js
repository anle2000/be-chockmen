const axios = require("axios");
const qs = require("qs");
const { commonHeaders } = require("./shared");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: "",
    };
  }

  try {
    // Dữ liệu form được mã hóa
    const formData = qs.stringify({
      grant_type: "client_credentials",
      client_id: "7ad14539-87e3-4d3e-8adc-ca3eb06b01f9",
      client_secret: "2008F2DA4404CF6EFEEC7E7221FC44A908115ED4",
      scope: "PublicApi.Access",
    });

    // Gửi yêu cầu POST với form-encoded
    const response = await axios.post(
      "https://id.kiotviet.vn/connect/token",
      formData,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    // Trả về token nếu thành công
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({ token: response.data.access_token }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({
        error: error.response ? error.response.data : error.message,
      }),
    };
  }
};
