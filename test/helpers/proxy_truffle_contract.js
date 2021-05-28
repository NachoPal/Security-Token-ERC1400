class ProxyGenerator {
  constructor(proxy, contracts) {
    this.address = proxy.address;
    this.contracts = contracts;
    this.abi = [];

    contracts.forEach( contract => {
      this.abi = (this.abi).concat(contract.abi);
      //this.abi = Object.assign(this.abi, contract.abi);
    });

    this.abi.forEach(method => {
      if(method.type == 'function') {
        const outputs = method.outputs//.map(output => output.type);

        if(method.stateMutability == 'view' || method.stateMutability == 'pure') {
          this[method.name] = (...args) => {
            (args == null ? args = [] : args = args);
            let txObject;

            if(typeof args[args.length - 1] == 'object') {
              const data = web3.eth.abi.encodeFunctionCall(
                method,
                args.slice(0,args.length - 1)
              );
              txObject = args[args.length - 1];
              txObject['data'] = data;
              txObject['to'] = this.address;
            } else {
              const data = web3.eth.abi.encodeFunctionCall(method, args);
              txObject = {};
              txObject['data'] = data;
              txObject['to'] = this.address;
            }

            return new Promise((resolve, reject) => {
              web3.eth.call(
                txObject,
                (err, result) => {
                  if(err){ return reject(err) }
                  return resolve(this.decodeParameters(result, outputs))
              });
            });
          }
        } else {
          this[method.name] = async (...args) => {

            const data = web3.eth.abi.encodeFunctionCall(
              method,
              args.slice(0,args.length - 1)
            );

            let txObject = args[args.length - 1];
            txObject['data'] = data;
            txObject['to'] = this.address;
            if(txObject['gas'] == null) {
              const estimatedGas = await this.estimateGas(txObject);
              txObject['gas'] = estimatedGas * 2;
            }
            return new Promise((resolve, reject) => {
              web3.eth.sendTransaction(
                txObject,
                (err, result) => {
                  if(err){ return reject(err) }
                  //return resolve(this.decodeParameters(result, outputs))
                  return resolve(result)
                }
              );
            });
          }
        }
      }
    });
  }

  estimateGas(txObject) {
    return new Promise((resolve, reject) => {
      web3.eth.estimateGas(
        txObject,
        (err, result) => {
          if(err){ return reject(err) }
          return resolve(result)
        }
      );
    });
  }

  decodeParameters(data, outputs) {
    const decodedData = web3.eth.abi.decodeParameters(outputs, data);
    //console.log(decodedData)
    if(decodedData.__length__ == 1) {
      return(decodedData[0]);
    } else {
      return(decodedData);
    }
  }
}

module.exports = ProxyGenerator;
