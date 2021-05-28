//Development
const Web3 = require('web3');
var web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8545'));

module.exports = {
  run: (accounts) => {

    const oneYearSeconds = 366 * 24 * 60 * 60;
    const threeMonthsSeconds = 91 * 24 * 60 * 60;
    const tokenDecimals = 6;
    const navDecimals = 6;

    const seedObject = {
      tokenDecimals: tokenDecimals,
      navDecimals: navDecimals,
      erc20details: {
        name: "SecurityToken",
        symbol: "SEC",
        decimals: tokenDecimals,
        nav: 0.5*10**navDecimals,
        navDecimals: navDecimals,
        lotSize: 500*10**tokenDecimals
      },
      //controllers: [accounts[1], accounts[2]],
      controllers: [accounts[2], accounts[3]],
      documents: ["document_1", "document_2"],
      //operators: [accounts[3], accounts[4]],
      operators: [accounts[1], accounts[4]],
      tokenHolders: [accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]],
      //defaultPartitions: ["april_2019", "may_2019", "june_2019"],
      defaultPartitions: ["september_2019", "october_2019", "november_2019"],
      lockupRedemptionTimestamps: [
        1567296000 + oneYearSeconds, //defaultPartitions[0] epoch time + 1 year
        1569888000 + oneYearSeconds, //defaultPartitions[1] epoch time + 1 year
        1572566400 + oneYearSeconds  //defaultPartitions[2] epoch time + 1 year
      ],
      lockupTransferTimestamps: [
        1567296000 + threeMonthsSeconds, //defaultPartitions[0] epoch time + 3 months
        1569888000 + threeMonthsSeconds, //defaultPartitions[1] epoch time + 3 months
        1572566400 + threeMonthsSeconds  //defaultPartitions[2] epoch time + 3 months
      ],
      granularity: [ //in dollars
        10000,
        10000,
        10000
      ],
      saleFloor: [ //in dollars
        100000,
        100000,
        100000
      ],
      redemptionFloor: [ //in dollars
        100000,
        100000,
        100000
      ],
      issuanceFloor: [ //in dollars
        100000,
        100000,
        100000
      ],
      //defaultTokenValue: 10**14,
      defaultTokenValue: 100000000*10**tokenDecimals,
      partitionVariables: [
        {
          key: web3.utils.padRight(web3.utils.toHex("lockup_expiration_redemption"), 64),
          kind: "uint256"
        },
        {
          key: web3.utils.padRight(web3.utils.toHex("lockup_expiration_transfer"), 64),
          kind: "uint256"
        },
        {
          key: web3.utils.padRight(web3.utils.toHex("granularity"), 64),
          kind: "uint256"
        },
        {
          key: web3.utils.padRight(web3.utils.toHex("sale_floor"), 64),
          kind: "uint256"
        },
        {
          key: web3.utils.padRight(web3.utils.toHex("redemption_floor"), 64),
          kind: "uint256"
        },
        {
          key: web3.utils.padRight(web3.utils.toHex("issuance_floor"), 64),
          kind: "uint256"
        }
      ]
    }

    let seed = {};
    let documentsHash = {};
    let defaultPartitionsHash = {};
    let tokenHoldersHash = {};
    let issuancesHash = {};
    let controllersHash = {};
    let defaultTokenValue;

    for(let i=0; i < seedObject.documents.length; i++) {
      documentsHash[i+1] = {
        name: web3.utils.padRight(web3.utils.toHex(seedObject.documents[i]), 64),
        uri: "https://sec.net/documents/",
        documentHash: web3.utils.sha3(seedObject.documents[i]),
        timeStamp: 0,
        index: 0
      }
    }

    for(let i=0; i < seedObject.defaultPartitions.length; i++) {
      defaultPartitionsHash[i+1] = web3.utils.padRight(web3.utils.toHex(seedObject.defaultPartitions[i]), 64);
    }

    const partitionsLength = seedObject.defaultPartitions.length;

    for(let i=partitionsLength; i <= seedObject.tokenHolders.length*partitionsLength; i+=partitionsLength) {

      for(let j=0; j < partitionsLength; j++) {
        issuancesHash[i-j] = {
          partition: web3.utils.padRight(web3.utils.toHex(seedObject.defaultPartitions[j]), 64),
          tokenHolder: seedObject.tokenHolders[(i/partitionsLength)-1],
          value: seedObject.defaultTokenValue * (i/(2*(j+1))),
        }
      }
    }

    for(let i=0; i < seedObject.controllers.length; i++) {
      controllersHash[i+1] = seedObject.controllers[i];
    }

    for(let i=0; i < seedObject.tokenHolders.length; i++) {
      tokenHoldersHash[i+1] = seedObject.tokenHolders[i];
    }

    seed["partitionValues"] = [];
    let partitionData;

    for(let i=0; i < seedObject.defaultPartitions.length; i++) {
      partitionData = {
        name: web3.utils.padRight(web3.utils.toHex(seedObject.defaultPartitions[i]), 64),
        data: web3.eth.abi.encodeParameters(
          ["bytes32[]", "bytes32[]"],
          [
            [
              seedObject.partitionVariables[0].key,
              seedObject.partitionVariables[1].key,
              seedObject.partitionVariables[2].key,
              seedObject.partitionVariables[3].key,
              seedObject.partitionVariables[4].key,
              seedObject.partitionVariables[5].key
            ],
            [
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.lockupRedemptionTimestamps[i]), 64),
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.lockupTransferTimestamps[i]), 64),
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.granularity[i]), 64),
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.saleFloor[i]), 64),
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.redemptionFloor[i]), 64),
              web3.utils.padLeft(web3.utils.numberToHex(seedObject.issuanceFloor[i]), 64)
            ]
          ]
        )
      }

      seed["partitionValues"].push(partitionData);
    }

    seed["lotSize"] = seedObject.erc20details.lotSize
    seed["tokenDecimals"] = seedObject.tokenDecimals
    seed["navDecimals"] = seedObject.navDecimals
    seed["erc20details"] = seedObject.erc20details
    seed["controllers"] = controllersHash;
    seed["documents"] = documentsHash;
    seed["tokenHolders"] = tokenHoldersHash;
    seed["defaultPartitions"] = defaultPartitionsHash;
    seed["issuances"] = issuancesHash;
    seed["defaultTokenValue"] = seedObject.defaultTokenValue;
    seed["operators"] = seedObject.operators;
    seed["partitionVariables"] = seedObject.partitionVariables;
    seed["lockupRedemptionTimestamps"] = seedObject.lockupRedemptionTimestamps;
    seed["lockupTransferTimestamps"] = seedObject.lockupTransferTimestamps;
    seed["granularity"] = seedObject.granularity;
    seed["saleFloor"] = seedObject.saleFloor;
    seed["redemptionFloor"] = seedObject.redemptionFloor;
    seed["issuanceFloor"] = seedObject.issuanceFloor;

    return seed;
  }
}
