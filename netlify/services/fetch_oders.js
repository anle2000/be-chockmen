const axios = require("axios");
const { url_project } = require("../functions/shared");

// Function to fetch orders from the API
const fetchOrders = async () => {
  const now = new Date();
  now.setHours(now.getHours() + 7); // Chuyển sang giờ Việt Nam
  const formattedDate = now.toISOString().split("T")[0]; // YYYY-MM-DD

  // GET LAST THREE DAYS
  const getLastThreeDays = () => {
    const dates = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i); // Lùi về các ngày trước đó
      dates.push(date.toISOString().split("T")[0]); // Lưu theo format YYYY-MM-DD
    }
    return dates;
  };

  const lastThreeDays = getLastThreeDays();

  const payload = {
    status: [1, 3, 4],
    lastModifiedFrom: `${lastThreeDays[2]}T00:00:00`, // Lấy ngày xa nhất trong 3 ngày
    toDate: `${lastThreeDays[0]}T23:59:59`, // Lấy ngày gần nhất (hôm nay)
    branchIds: [26576],
  };

  try {
    const response = await axios.post(
      `${url_project}/functions/read_orders_kiotviet`,
      payload
    );
    return response.data.data || [];
  } catch (error) {
    console.error("Error fetching orders:", error);
    return [];
  }
};

module.exports = {
  fetchOrders,
};
