// CHUNK ARRAY
const chunkArray = (array, size) => {
  const chunkedArr = [];
  for (let i = 0; i < array.length; i += size) {
    chunkedArr?.push(array?.slice(i, i + size));
  }
  return chunkedArr;
};

// CONVERT TO VIET NAM TIME
const convertToVietnamTime = (utcDateString) => {
  const date = new Date(utcDateString);
  date.setHours(date.getHours() + 7); // Chuyển sang GMT+7
  return date.toISOString().replace("T", " ").split(".")[0]; // Định dạng YYYY-MM-DD HH:MM:SS
};

const removeUndefinedFields = (obj) => {
  return JSON.parse(JSON.stringify(obj)); // Tự động loại bỏ undefined
};

module.exports = {
  chunkArray,
  convertToVietnamTime,
  removeUndefinedFields,
};
