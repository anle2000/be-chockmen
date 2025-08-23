const axios = require("axios");
const url_project = "https://async-data-chockmen.netlify.app/.netlify";
const url_dev = "http://localhost:8888/.netlify";

// Define common headers
const commonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS,POST,PUT",
  "Access-Control-Allow-Headers":
    "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers",
};

// Hàm lấy token
const getToken = async (project) => {
  const response = await axios.post(`${url_project}/functions/token`, {
    project,
  });
  return response.data.token;
};

// Hàm lấy token từ KiotViet
const getKiotVietToken = async () => {
  const response = await axios.post(`${url_project}/functions/token_kiot_viet`);
  return response.data.token;
};

// Hàm cập nhật token
const updateToken = async (token) => {
  await axios.post(`${url_project}/functions/create_or_update_token`, {
    id: "[chock-men]-oa-token-2",
    project: "chock-men",
    token: token,
    userUpdated: "SERVER",
  });
};

// Generate new user ID
const generateNewId = async (dataRef, project, db) => {
  const snapshot = await dataRef.orderBy("id", "desc").limit(1).get();
  let newId = 1;

  if (!snapshot.empty) {
    const lastDocId = snapshot.docs[0].data().id;
    const lastNumericId = parseInt(lastDocId.split("-").pop(), 10);
    newId = lastNumericId + 1;
  }

  return `[${project}]-${db}-${newId}`;
};

const project = "chock-men";

const retailer = "dathangnhanh";

module.exports = {
  commonHeaders,
  getToken,
  getKiotVietToken,
  updateToken,
  project,
  retailer,
  generateNewId,
  url_project,
  url_dev,
};
