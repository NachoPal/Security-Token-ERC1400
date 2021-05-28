const txHelper = require('./transactions');
const getAbiByFunctionNames = txHelper.getAbiByFunctionNames;

module.exports = {
  get: async (contract, eventName) => {
    return await web3.eth.getPastLogs({
              fromBlock: 1,
              address: contract.address,
              topics: [
                web3.eth.abi.encodeEventSignature(
                  getAbiByFunctionNames(contract.abi)[eventName]
                )
              ]
            });
  },

  decode: (contract, eventName, logs) => {
    const decodedLog = web3.eth.abi.decodeLog(
      getAbiByFunctionNames(contract.abi)[eventName].inputs,
      logs[logs.length - 1].data,
      _.drop(logs[logs.length - 1].topics)
    );

    const length = Object.keys(decodedLog).length/2;

    for(let i=0; i < length; i++) {
      delete decodedLog[i];
    }

    delete decodedLog['__length__'];

    return decodedLog;
  }
}
