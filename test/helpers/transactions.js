const getAbiByFunctionNames = (abi) => {
  return _.mapKeys(abi,"name");
}

const encodedFunctionCall = (name, inputs, abi) => {
  return web3.eth.abi.encodeFunctionCall(getAbiByFunctionNames(abi)[name], inputs);
}

module.exports = {
  getTxData: (obj) => {
    return encodedFunctionCall(obj.functionName, Object.values(obj.arguments), obj.abi)
  },
  getAbiByFunctionNames: getAbiByFunctionNames
}
