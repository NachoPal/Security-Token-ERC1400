//Development
const Web3 = require('web3');
var web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8545'));

module.exports = {
  run: (accounts) => {

    const oneYearSeconds = 366 * 24 * 60 * 60;
    const threeMonthsSeconds = 91 * 24 * 60 * 60;
    const oneDaySeconds = 24 * 60 * 60;
    const tokenDecimals = 6;
    const navDecimals = 6;
    const nav = 1;
    const lotSize = 10000;
    const now = Math.round(Date.now()/1000);
    //const partitionName = new Date(now*1000); //2019-04-08T05:17:58.000Z

    const seedObject = {
      tokenDecimals: tokenDecimals,
      navDecimals: navDecimals,
      erc20details: {
        name: "SEC_Q",
        symbol: "SEC_Q",
        decimals: tokenDecimals,
        nav: nav*10**navDecimals,
        navDecimals: navDecimals,
        lotSize: lotSize*10**tokenDecimals
      },
      lotSize: lotSize*10**tokenDecimals,
      controllers: ["0xbcd6389c2c578eaeb1b35bd356c0a4c1d30f69f4", "0xd08059ee4d931aced2dc57834abc179718da9d81"],
      documents: [],
      operators: ["0xf022797e23c6683b17bd2fe5e1b75250fdc851e4"],
      tokenHolders: [],
      //defaultTokenValue: 100000000*10**tokenDecimals,
      defaultTokenValue: 100000*10**tokenDecimals,
      defaultPartitions: [web3.utils.padRight(web3.utils.toHex('SEC_D_05_2019'), 64)],
      //lockupRedemptionTimestamps: [now + oneDaySeconds],
      lockupRedemptionTimestamps: [now],
      granularity: [50000],
      issuanceFloor: [100000],
      partitionVariables: [
        {
          key: web3.utils.padRight(web3.utils.toHex("lockup_expiration_redemption"), 64),
          kind: "uint256"
        },
        {
          key: web3.utils.padRight(web3.utils.toHex("granularity"), 64),
          kind: "uint256"
        },
        {
          key: web3.utils.padRight(web3.utils.toHex("issuance_floor"), 64),
          kind: "uint256"
        }
      ]
    }

    let seed = {};
    //let auxSeedObject = {}


    //Object.assign(auxSeedObject, seedObject);
    //delete auxSeedObject.partitionValues;

    Object.assign(seed, seedObject);

    seed["partitionValues"] = [];

    for(let i=0; i < seedObject.defaultPartitions.length; i++) {
      partitionData = {
        name: seedObject.defaultPartitions[i],
        data: web3.eth.abi.encodeParameters(
          ["bytes32[]", "bytes32[]"],
          [
            [
              seedObject.partitionVariables[0].key,
              seedObject.partitionVariables[1].key,
              seedObject.partitionVariables[2].key
            ],
            [
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.lockupRedemptionTimestamps[i]), 64),
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.granularity[i]), 64),
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.issuanceFloor[i]), 64)
            ]
          ]
        )
      }
      seed["partitionValues"].push(partitionData);
      seed["partitionVariables"] = seedObject.partitionVariables;
    }
    return seed;
  }
}
