const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

const splitTextIntoChunks = async (text) => {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 200,
    chunkOverlap: 50,
  });

  return splitter.createDocuments([text]);
};

module.exports = { splitTextIntoChunks };
