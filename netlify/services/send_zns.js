const axios = require("axios");

/**
 * Gửi ZNS
 */
const sendZNS = async (template_id, appData, phone, templateData) => {
  if (appData) {
    const payload = {
      project: appData.project,
      phone: phone?.replace(/^0/, "84"),
      template_id: template_id,
      app_id: appData.znsConfig.id_app,
      // mode: "development",
      template_data: templateData,
    };

    console.log("----------payload", payload);

    try {
      const response = await axios.post(
        "https://data-portal-zalo-services.netlify.app/.netlify/functions/send_zns",
        payload
      );
      console.log("----------response", response.data);

      return response.data;
    } catch (error) {
      console.log("ZNS API Error:", error.response?.data || error.message);
      throw new Error("Failed to send ZNS notification");
    }
  }
};

module.exports = {
  sendZNS,
};
