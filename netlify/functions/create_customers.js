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
  const response = await axios.post(
    "https://public.kiotapi.com/customers",
    params,
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

// Hàm gọi API dự phòng khi lỗi 420
const callBackupApi = async (params) => {
  const response = await axios.post(
    "https://async-data-chockmen.netlify.app/.netlify/functions/customers",
    params,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const { data } = response.data;

  const backupData = {
    id: data[0].id,
    code: data[0].code,
    name: data[0].name,
    gender: data[0].gender,
    contactNumber: data[0].contactNumber,
    retailerId: data[0].retailerId,
    branchId: data[0].branchId,
    createdDate: data[0].createdDate,
    type: data[0].type,
  };

  try {
    // Gọi API Zalo để tạo lại tài khoản
    await axios.post(
      "https://data-portal-zalo-services.netlify.app/.netlify/functions/create_or_update_user_zalo",
      {
        fullName: backupData.name,
        avatar: params.avatar, // Truyền avatar nếu có
        phone: backupData.contactNumber,
        project,
        rewardPoints: params.rewardPoints,
        createByPhone: params.createByPhone,
        code: backupData.code,
        retailerId: backupData.retailerId,
        branchId: backupData.branchId,
        createdDate: backupData.createdDate,
        type: backupData.type,
      }
    );

    return {
      message: "Tài khoản đã được đăng ký và đồng bộ với Zalo",
      data: backupData,
    };
  } catch (zaloError) {
    return {
      message: "Tài khoản đã được đăng ký nhưng không thể đồng bộ với Zalo",
      data: backupData,
      zaloError: zaloError?.message || "Unknown error",
    };
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

  const {
    name,
    contactNumber,
    branchId,
    avatar,
    rewardPoints,
    createByPhone,
    gender,
  } = JSON.parse(event.body || "{}");

  try {
    let responseData;

    const token = await getToken(project);
    const _apiResponse = await callApi(token, {
      name,
      contactNumber,
      gender,
      branchId,
      avatar,
      groupIds: [121896],
    });

    const apiResponse = _apiResponse.data;

    if (apiResponse) {
      try {
        const apiResponseZalo = await axios.post(
          "https://data-portal-zalo-services.netlify.app/.netlify/functions/create_or_update_user_zalo",
          {
            fullName: name,
            avatar: avatar,
            phone: contactNumber,
            project,
            rewardPoints: rewardPoints,
            createByPhone: createByPhone,
            code: apiResponse.code,
            retailerId: apiResponse.retailerId,
            branchId: apiResponse.branchId,
            createdDate: apiResponse.createdDate,
            type: apiResponse.type,
          }
        );

        responseData = apiResponseZalo.data;

        // Trả về thành công với dữ liệu nếu có
        return {
          statusCode: 200,
          headers: commonHeaders,
          body: JSON.stringify({
            message: "Dữ liệu đồng bộ thành công",
            data: apiResponseZalo.data,
          }),
        };
      } catch (apiError) {
        return {
          statusCode: 500,
          headers: commonHeaders,
          body: JSON.stringify({
            message: "Dữ liệu đồng bộ thất bại",
            data: null,
          }),
        };
      }
    }

    // Nếu không có dữ liệu trả về "No data found"
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: JSON.stringify({
        message: "Đăng ký thành công",
        data: responseData,
      }),
    };
  } catch (error) {
    if (error.response) {
      const { status } = error.response;

      // Nếu lỗi 401, lấy token mới và thử lại
      if (status === 401) {
        try {
          const newToken = await getKiotVietToken();
          await updateToken(newToken);
          const retryApiResponse = await callApi(newToken, {
            name,
            contactNumber,
            gender,
            branchId,
            avatar,
            groupIds: [121896],
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

      // Nếu lỗi 420, gọi API dự phòng
      if (status === 420) {
        try {
          const backupResponse = await callBackupApi({
            name,
            contactNumber,
            gender,
            branchId,
            avatar,
            rewardPoints,
            createByPhone,
          });
          return {
            statusCode: 200,
            headers: commonHeaders,
            body: JSON.stringify(backupResponse),
          };
        } catch (backupError) {
          return {
            statusCode: 500,
            headers: commonHeaders,
            body: JSON.stringify({
              error: `Backup API error: ${backupError?.message}`,
            }),
          };
        }
      }
    }

    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({ error: `Error: ${error?.message}` }),
    };
  }
};
