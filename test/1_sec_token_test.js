var colors = require('colors');
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
const txHelper = require('./helpers/transactions');
const logs = require('./helpers/logs');
const seeding = require('./helpers/seed');
const getTxData = txHelper.getTxData;
const getAbiByFunctionNames = txHelper.getAbiByFunctionNames;
const error = require('./helpers/error_codes');
const ProxyGenerator = require('./helpers/proxy_truffle_contract');

chai.use(chaiAsPromised);
const expect = chai.expect;

const SecurityTokenArtifacts = artifacts.require("SecurityToken");
const RulesArtifacts = artifacts.require("Rules");
const PartitionsArtifacts = artifacts.require("Partitions");
const CertificateTokenArtifacts = artifacts.require("CertificateToken");
const CertificateControllerArtifacts = artifacts.require("CertificateController");
const ERC20artifacts = artifacts.require("ERC20");
const ERC1410artifacts = artifacts.require("ERC1410");
const ERC1594artifacts = artifacts.require("ERC1594");
const ERC1643artifacts = artifacts.require("ERC1643");
const ERC1644artifacts = artifacts.require("ERC1644");



contract('Integration Tests', (ACCOUNTS) => {

  const seed = seeding.run(ACCOUNTS);

  const ERC20_DETAILS = seed.erc20details;
  const ZERO_ADDRESS = web3.utils.padRight("0x0", 40);
  const ZERO_32BYTES = web3.utils.padRight("0x0", 64);
  const ISSUER_1 = ACCOUNTS[0];
  const ISSUER_2 = ACCOUNTS[ACCOUNTS.length-1];
  const CONTROLLER_1 = seed.controllers["1"];
  const CONTROLLER_2 = seed.controllers["2"];
  const CONTROLLER_3 = ACCOUNTS[ACCOUNTS.length-2];
  const OPERATOR_1 = seed.operators[0];
  const OPERATOR_2 = seed.operators[1];
  const NEW_OPERATOR = ACCOUNTS[ACCOUNTS.length-3];
  const TOKEN_HOLDER = Object.values(seed.tokenHolders);
  const NEW_TOKEN_HOLDERS = [ACCOUNTS[ACCOUNTS.length-4], ACCOUNTS[ACCOUNTS.length-5]];
  const INITIAL_DOCUMENTS = seed.documents;
  const DOCUMENTS_LIST = [seed.documents["1"].name, seed.documents["2"].name];
  const DEFAULT_PARTITIONS = Object.values(seed.defaultPartitions);
  const NEW_PARTITION_1 = web3.utils.padRight(web3.utils.toHex("new_partition_1"), 64);
  const NEW_PARTITION_2 = web3.utils.padRight(web3.utils.toHex("new_partition_2"), 64);
  const NEW_PARTITION_3 = web3.utils.padRight(web3.utils.toHex("new_partition_3"), 64);
  const NEW_PARTITION_4 = web3.utils.padRight(web3.utils.toHex("new_partition_4"), 64);
  const INVALID_PARTITION = web3.utils.padRight(web3.utils.toHex("invalid_partition"), 64);
  const ISSUANCES = Object.values(seed.issuances);
  const DEFAULT_TOKEN_VALUE = seed.defaultTokenValue;
  const NEW_RULES_CONTRACT = web3.utils.toChecksumAddress(web3.utils.randomHex(20));
  const NOW = Math.floor(Date.now()/1000);
  const TOKEN_DECIMALS = seed.tokenDecimals;
  const NAV_DECIMALS = seed.navDecimals;
  let LOT_SIZE = seed.lotSize;

  const initializeDocument = (name) => {
    return({
      name: web3.utils.padRight(web3.utils.toHex(name), 64),
      uri: "https://sec.net/documents/",
      documentHash: web3.utils.sha3(name),
    });
  }

  const pushDocument = (document) => {
    DOCUMENTS_LIST.push(document);
  }

  const removeDocument = (document) => {
    const length = DOCUMENTS_LIST.length;
    const index = DOCUMENTS_LIST.indexOf(document);
    DOCUMENTS_LIST[index] = DOCUMENTS_LIST[length-1];
    DOCUMENTS_LIST.pop();
  }

  const issueNewPartition = async (contract, partition, value, tokenHolder, data) => {
      await contract.issueByPartition(
        partition,
        tokenHolder,
        value,
        data,
        {from: ISSUER_1}
      );
  }

  const getTokenHolderBalance = async (contract, tokenHolder) => {
    let balance = {}
    let balanceOfByPartition;

    const partitions = await contract.partitionsOf(tokenHolder);

    for(let i=0; i < partitions.length; i++) {
      balanceOfByPartition = await contract.balanceOfByPartition(partitions[i], tokenHolder);
      balance[partitions[i]] = Number(balanceOfByPartition);
    }

    return balance;
  }

  const timeTravelFuture = function(time) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
          jsonrpc: "2.0",
          method: "evm_increaseTime",
          params: [time],
          id: new Date().getSeconds()
      }, (err, result) => {
        if(err){ return reject(err) }
        return resolve(result)
      });
    });
  };

  const snapshotCreate = () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
          jsonrpc: "2.0",
          method: "evm_snapshot",
          id: new Date().getSeconds()
      }, (err, result) => {
        if(err){ return reject(err) }
        return resolve(result)
      });
    });
  };

  const snapshotRevert = (id) => {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_revert",
        params: [id],
        id: new Date().getSeconds()
      }, (err, result) => {
        if(err){ return reject(err) }
        return resolve(result)
      });
    });
  };

  const mineBlock = () => {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [],
        id: new Date().getSeconds()
      }, (err, result) => {
        if(err){ return reject(err) }
        return resolve(result)
      });
    });
  };

  const getSignatureParameters = (signature) => {
    const r = signature.slice( 0, 66 );
    const s = `0x${signature.slice( 66, 130 )}`;
    let v = `0x${signature.slice( 130, 132 )}`;
    v = web3.utils.toDecimal( v );

    if ( ![ 27, 28 ].includes( v ) ) v += 27;

    return {
        r,
        s,
        v
    };
  };

  const getManagementControllerData = async (params) => {
    const certificate = web3.eth.abi.encodeParameters(
      [
        'address',
        'address',
        'uint256',
      ],
      [
        params.newController,
        params.token,
        params.nonce
      ]
    );

    const certificateHash = web3.utils.keccak256(certificate);
    const signedCertificate = await web3.eth.sign(
      certificateHash,
      params.controller
    );
    const signature = getSignatureParameters(signedCertificate);
    const controllerData = web3.eth.abi.encodeParameters(
      [
        'bytes',
        'bytes32',
        {"Signature": {
          "r": 'bytes32',
          "s": 'bytes32',
          "v": 'uint8'
        }}
      ],
      [
        certificate,
        certificateHash,
        signature
      ]
    );
    return controllerData;
  }

  const getTransferControllerData = async (params) => {
    const certificate = web3.eth.abi.encodeParameters(
      [
        'bytes32',
        'address[]',
        'uint256[]'
      ],
      [
        params.partition,
        [params.token, params.from, params.to],
        [params.value, params.nonce]
      ]
    );

    const certificateHash = web3.utils.keccak256(certificate);
    const signedCertificate = await web3.eth.sign(
      certificateHash,
      params.controller
    );
    const signature = getSignatureParameters(signedCertificate);
    const controllerData = web3.eth.abi.encodeParameters(
      [
        'bytes',
        'bytes32',
        {"Signature": {
          "r": 'bytes32',
          "s": 'bytes32',
          "v": 'uint8'
        }}
      ],
      [
        certificate,
        certificateHash,
        signature
      ]
    );
    return controllerData;
  }

  const asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  const printCurrentDate = async () => {
    const lastBlock = await web3.eth.getBlock("latest");
    let date = new Date(0);
    date.setUTCSeconds(lastBlock.timestamp);
    console.log(("\t    " + date).cyan);
  }


  before("Contracts instances", async () => {
    SecurityToken = await SecurityTokenArtifacts.deployed();
    Rules = await RulesArtifacts.deployed();
    Partitions = await PartitionsArtifacts.deployed();
    CertificateToken = await CertificateTokenArtifacts.deployed();
    CertificateController = await CertificateControllerArtifacts.deployed();
    ERC1410 = await ERC1410artifacts.deployed();
    ERC1594 = await ERC1594artifacts.deployed();
    ERC1643 = await ERC1643artifacts.deployed();
    ERC1644 = await ERC1644artifacts.deployed();
    ERC20 = await ERC20artifacts.deployed();

    SecurityToken =  new ProxyGenerator(
      SecurityToken, [ERC1643, ERC1644, ERC20, ERC1410, ERC1594]
    );
  });

  after("Revert changes and Time travel to the past", async () => {
    snapshotRevert(1);
    mineBlock();
  });


  describe("======================= Partitions =======================", () => {
    describe("Deployment", () => {
      describe("Set variables", () => {
        it("should set initial variables", async () => {
          const variables = await Partitions.getVariables();

          for(let i=0; i < seed.partitionVariables.length; i++) {
            assert.deepEqual(
              {key: variables[i].key, kind: variables[i].kind},
              seed.partitionVariables[i],
              `${i}. variables were not got properly`
            );
          }
        });
      });

      describe("Set partitions", () => {
        it("should set default partitions with they values", async () => {

          const assertInitialPartition = async (partition) => {

            let i = Object.values(seed.defaultPartitions).indexOf(partition);

            await asyncForEach(seed.partitionVariables, async variable => {
              let value = await Partitions.getValue(
                web3.utils.padRight(web3.utils.toHex(partition), 64),
                web3.utils.padRight(web3.utils.toHex(variable.key), 64)
              );

              if(web3.utils.hexToUtf8(variable.key) == 'lockup_expiration_redemption'){
                assert.equal(
                  web3.utils.hexToNumber(value),
                  seed.lockupRedemptionTimestamps[i],
                  "1. patitions are not set properly"
                );
              }

              if(web3.utils.hexToUtf8(variable.key) == 'lockup_expiration_transfer'){
                assert.equal(
                  web3.utils.hexToNumber(value),
                  seed.lockupTransferTimestamps[i],
                  "2. patitions are not set properly"
                );
              } else

              if(web3.utils.hexToUtf8(variable.key) == 'granularity'){
                assert.equal(
                  web3.utils.hexToNumber(value),
                  seed.granularity[i],
                  "3. patitions are not set properly"
                );
              } else

              if(web3.utils.hexToUtf8(variable.key) == 'sale_floor'){
                assert.equal(
                  web3.utils.hexToNumber(value),
                  seed.saleFloor[i],
                  "4. patitions are not set properly"
                );
              } else

              if(web3.utils.hexToUtf8(variable.key) == 'redemption_floor'){
                assert.equal(
                  web3.utils.hexToNumber(value),
                  seed.redemptionFloor[i],
                  "5. patitions are not set properly"
                );
              } else

              if(web3.utils.hexToUtf8(variable.key) == 'issuance_floor'){
                assert.equal(
                  web3.utils.hexToNumber(value),
                  seed.issuanceFloor[i],
                  "6. patitions are not set properly"
                );
              }
            });
          }

          await asyncForEach(DEFAULT_PARTITIONS, async partition => {
            await assertInitialPartition(partition);
          });
        });
      });
    });

    describe("Ownable", () => {
      describe("#transferOwnership - (issuer)", () => {
        it("issuer should transfer ownership", async () => {
          await Partitions.transferOwnership(ISSUER_2,{from: ISSUER_1});
          const issuer = await Partitions.issuer();
          assert.equal(issuer, ISSUER_2, "new issuer is not ser properly");
          await Partitions.transferOwnership(ISSUER_1,{from: ISSUER_2});
        });

        it("should emit *IssuerTransferred* event", async () => {
          const encodedLogs = await logs.get(Partitions, 'IssuerTransferred');
          const decodedLog = logs.decode(Partitions, 'IssuerTransferred', encodedLogs);
          const expectedLog = {
            previousIssuer: ISSUER_2,
            newIssuer: ISSUER_1
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not issuer", async () => {
          await expect(
            Partitions.transferOwnership(ISSUER_2,{from: ISSUER_2})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should revert if new issuer address is 0x00", async () => {
          await expect(
            Partitions.transferOwnership(ZERO_ADDRESS, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x68"]);
        });
      });
    });

    describe("Partitions", () => {
      describe("#setToken - (issuer)", () => {
        it("should revert if not issuer", async () => {
          await expect(
            Partitions.setToken(SecurityToken.address, {from: TOKEN_HOLDER[0]})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should set SecurityToken as owner of Partitions", async () => {
          await Partitions.setToken(SecurityToken.address, {from: ISSUER_1});
          const token = await Partitions.token();
          assert.equal(token, SecurityToken.address, "token was not set properly");
        });

        it("should emit *TokenSet* event", async () => {
          const encodedLogs = await logs.get(Partitions, 'TokenSet');
          const decodedLog = logs.decode(Partitions, 'TokenSet', encodedLogs);
          const expectedLog = {token: SecurityToken.address}

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if a new token is set", async () => {
          await expect(
            Partitions.setToken(SecurityToken.address, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x71"]);
        });
      });

      describe("#setVariables - (issuer)", () => {
        it("should set a new variable", async () => {
          const newVariable = [{
            key: web3.utils.padRight(web3.utils.toHex("new_variable_issuer"), 64),
            kind: "byte"
          }]

          await Partitions.setVariables(newVariable, {from: ISSUER_1});
          const variables = await Partitions.getVariables();

          assert.deepEqual(
            {
              key: variables[variables.length - 1].key,
              kind: variables[variables.length - 1].kind
            },
            newVariable[0],
            "variables were not ser properly"
          );
        });

        it("should emit *VariableSet* event", async () => {
          const encodedLogs = await logs.get(Partitions, 'VariableSet');
          const decodedLog = logs.decode(Partitions, 'VariableSet', encodedLogs);
          const expectedLog = {
            key: web3.utils.padRight(web3.utils.toHex("new_variable_issuer"), 64),
            kind: "byte"
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });


        it("should revert if variable already exists", async () => {
          const newVariable = [{
            key: web3.utils.padRight(web3.utils.toHex("new_variable_issuer"), 64),
            kind: "uint8"
          }]

          await expect(
            Partitions.setVariables(newVariable, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x72"]);
        });

        it("should revert if not issuer", async () => {
          const newVariable = [{
            key: web3.utils.padRight(web3.utils.toHex("new_variable_invalid"), 64),
            kind: "uint8"
          }]

          await expect(
            Partitions.setVariables(newVariable, {from: TOKEN_HOLDER[0]})
          ).to.eventually.be.rejectedWith(error["0x66"]);

        });
      });

      describe("#setPartition - (issuer)", () => {
        it("should set a partition", async () => {
          const lockupTimestamp = 1561939200;

          let expectedValues = [
            web3.utils.padLeft(web3.utils.numberToHex(NOW), 64),
            web3.utils.padLeft(web3.utils.numberToHex(NOW), 64),
            web3.utils.padLeft(web3.utils.numberToHex(seed.granularity[0]), 64),
            web3.utils.padLeft(web3.utils.numberToHex(seed.saleFloor[0]), 64),
            web3.utils.padLeft(web3.utils.numberToHex(seed.redemptionFloor[0]), 64),
            web3.utils.padLeft(web3.utils.numberToHex(seed.issuanceFloor[0]), 64)
          ];

          const keys = [
            seed.partitionVariables[0].key,
            seed.partitionVariables[1].key,
            seed.partitionVariables[2].key,
            seed.partitionVariables[3].key,
            seed.partitionVariables[4].key,
            seed.partitionVariables[5].key
          ];

          await Partitions.setPartition(
            NEW_PARTITION_1,
            web3.eth.abi.encodeParameters(
              ["bytes32[]", "bytes32[]"],
              [
                keys,
                expectedValues
              ]
            ),
            {from: ISSUER_1}
          );

          await Partitions.setPartition(
            NEW_PARTITION_2,
            web3.eth.abi.encodeParameters(
              ["bytes32[]", "bytes32[]"],
              [
                keys,
                expectedValues
              ]
            ),
            {from: ISSUER_1}
          );

          await Partitions.setPartition(
            NEW_PARTITION_3,
            web3.eth.abi.encodeParameters(
              ["bytes32[]", "bytes32[]"],
              [
                keys,
                expectedValues
              ]
            ),
            {from: ISSUER_1}
          );

          await Partitions.setPartition(
            NEW_PARTITION_4,
            web3.eth.abi.encodeParameters(
              ["bytes32[]", "bytes32[]"],
              [
                keys,
                expectedValues
              ]
            ),
            {from: ISSUER_1}
          );

          values = [];

          for(let i=0; i < seed.partitionVariables.length; i++) {
            values[i] = await Partitions.getValue(
              NEW_PARTITION_1,
              web3.utils.padRight(web3.utils.toHex(seed.partitionVariables[i].key), 64)
            );

            assert.equal(
              values[i],
              expectedValues[i],
              `${i}. patitions are not set properly`
            );
          }
        });

        it("should emit *PartitionSet* event", async () => {
          const encodedLogs = await logs.get(Partitions, 'PartitionSet');
          const decodedLog = logs.decode(Partitions, 'PartitionSet', encodedLogs);
          const expectedLog = {
            partition: NEW_PARTITION_4
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if partition already exists", async () => {
          const partition = DEFAULT_PARTITIONS[0];
          const lockupTimestamp = seed.lockupRedemptionTimestamps[0];
          const data = web3.eth.abi.encodeParameters(
            ["bytes32[]", "bytes32[]"],
            [
              [seed.partitionVariables[0].key],
              [web3.utils.padLeft(web3.utils.numberToHex(lockupTimestamp), 64)]
            ]
          );

          await expect(
            Partitions.setPartition(partition, data, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x73"]);
        });

        it("should revert if not issuer", async () => {
          const partition = NEW_PARTITION_3;
          const lockupTimestamp = seed.lockupRedemptionTimestamps[0];
          const data = web3.eth.abi.encodeParameters(
            ["bytes32[]", "bytes32[]"],
            [
              [seed.partitionVariables[0].key],
              [web3.utils.padLeft(web3.utils.numberToHex(lockupTimestamp), 64)]
            ]
          );

          await expect(
            Partitions.setPartition(partition, data, {from: TOKEN_HOLDER[0]})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("#setValues - (issuer)", () => {
        it("should set a partition value", async () => {
          const partition = NEW_PARTITION_1;
          const initialLockupTimestamp = 1561939200;
          const data = web3.eth.abi.encodeParameters(
            ["bytes32[]", "bytes32[]"],
            [
              [seed.partitionVariables[0].key],
              [web3.utils.padLeft(web3.utils.numberToHex(initialLockupTimestamp + 1000), 64)]
            ]
          );

          await Partitions.setValues(partition, data, {from: ISSUER_1});

          const finalLockupTimestamp = await Partitions.getValue(
            partition,
            web3.utils.padRight(web3.utils.toHex(seed.partitionVariables[0].key), 64)
          );

          assert.equal(
            web3.utils.hexToNumber(finalLockupTimestamp),
            initialLockupTimestamp + 1000,
            "patitions values are not set properly"
          );
        });

        it("should emit *ValueSet* event", async () => {
          const initialLockupTimestamp = 1561939200;

          const encodedLogs = await logs.get(Partitions, 'ValueSet');
          const decodedLog = logs.decode(Partitions, 'ValueSet', encodedLogs);
          const expectedLog = {
            partition: NEW_PARTITION_1,
            key: seed.partitionVariables[0].key,
            value: web3.utils.padLeft(web3.utils.numberToHex(initialLockupTimestamp + 1000), 64)
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if partition does not exist", async () => {
          const partition = INVALID_PARTITION;
          const lockupTimestamp = 1564617600;
          const data = web3.eth.abi.encodeParameters(
            ["bytes32[]", "bytes32[]"],
            [
              [seed.partitionVariables[0].key],
              [web3.utils.padLeft(web3.utils.numberToHex(lockupTimestamp), 64)]
            ]
          );

          await expect(
            Partitions.setValues(partition, data, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x59"]);
        });

        it("should revert if partition key does not exist", async () => {
          const partition = NEW_PARTITION_1;
          const lockupTimestamp = 1561939200;
          const invalidKey = web3.utils.padRight(web3.utils.toHex("invalid_key"), 64);
          const data = web3.eth.abi.encodeParameters(
            ["bytes32[]", "bytes32[]"],
            [
              [invalidKey],
              [web3.utils.padLeft(web3.utils.numberToHex(lockupTimestamp), 64)]
            ]
          );

          await expect(
            Partitions.setValues(partition, data, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x74"]);
        });

        it("should revert if not issuer", async () => {
          const partition = DEFAULT_PARTITIONS[0];
          const lockupTimestamp = seed.lockupRedemptionTimestamps[0];
          const data = web3.eth.abi.encodeParameters(
            ["bytes32[]", "bytes32[]"],
            [
              [seed.partitionVariables[0].key],
              [web3.utils.padLeft(web3.utils.numberToHex(lockupTimestamp), 64)]
            ]
          );

          await expect(
            Partitions.setValues(partition, data, {from: TOKEN_HOLDER[0]})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });
    });
  });

  describe("======================= SecurityToken =======================", () => {
    describe("Deployment", () => {
      describe("Set ERC20 details", () => {
        it("should set token name, symbol, decimals, nav and nav decimals", async () => {
          const erc20details = {}
          erc20details["name"] = await SecurityToken.name();
          erc20details["symbol"] = await SecurityToken.symbol();
          const decimals = await SecurityToken.decimals();
          erc20details["decimals"] = Number(decimals);
          const nav = await SecurityToken.nav();
          erc20details["nav"] = Number(nav);
          const navDecimals = await SecurityToken.navDecimals();
          erc20details["navDecimals"] = Number(navDecimals);
          const lotSize = await SecurityToken.lotSize();
          erc20details["lotSize"] = Number(lotSize);

          assert.deepEqual(erc20details, ERC20_DETAILS, "erc20 details are not set properly");
        });
      });

      describe("Set Issuer", () => {
        it("should set a issuer", async () => {
          const issuer = await SecurityToken.issuer();

          assert.equal(issuer, ISSUER_1, "Issuer is not ser properly");
        });
      });

      describe("Set Controllers", () => {
        it("should set controllers", async () => {
          const isController1 = await SecurityToken.isController(CONTROLLER_1);
          const isController2 = await SecurityToken.isController(CONTROLLER_2);

          assert.isTrue(isController1, "Controller_1 was not set properly");
          assert.isTrue(isController2, "Controller_2 was not set properly");
        });
      });

      describe("Set Documents", () => {
        it("should set documents", async () => {
          const document1 = await SecurityToken.getDocument(DOCUMENTS_LIST[0]);
          const document2 = await SecurityToken.getDocument(DOCUMENTS_LIST[1]);

          const uri1 = document1[0];
          const uri2 = document2[0];
          const documentHash1 = document1[1];
          const documentHash2 = document2[1];
          const timeStamp1 = Number(document1[2]);
          const timeStamp2 = Number(document2[2]);

          assert.deepEqual(
            {
              uri: uri1,
              documentHash: documentHash1
            },
            {
              uri: INITIAL_DOCUMENTS["1"].uri,
              documentHash: INITIAL_DOCUMENTS["1"].documentHash
            },
            "Document_1 was not set properly"
          );

          assert.deepEqual(
            {
              uri: uri2,
              documentHash:documentHash2
            },
            {
              uri: INITIAL_DOCUMENTS["2"].uri,
              documentHash: INITIAL_DOCUMENTS["2"].documentHash
            },
            "Document_2 was not set properly"
          );

          assert.isBelow(timeStamp1, NOW + 1);
          assert.isBelow(timeStamp2, NOW + 1);

          assert.isAbove(timeStamp1, NOW - 60);
          assert.isAbove(timeStamp2, NOW - 60);
        });
      });

      describe("Set Default Partitions", () => {
        it("should set default partitions", async () => {
          const defaultPartitions = await SecurityToken.getDefaultPartitions();

          assert.deepEqual(
            defaultPartitions,
            DEFAULT_PARTITIONS,
            "default partitions are not set properly"
          );
        });
      });

      describe("Set TokenHolders", () => {
        it("should KYC token holders", async () => {
          await SecurityToken.KYCtokenHolders(TOKEN_HOLDER, {from: ISSUER_1});

          await asyncForEach(TOKEN_HOLDER, async (tokenHolder, i) => {
            let KYCed = await SecurityToken.isTokenHolderKYC(TOKEN_HOLDER[i]);
            assert.isTrue(KYCed, "token holders were not KYC properly");
          });
        });

        it("should revert if not issuer", async () => {
          await expect(
            SecurityToken.KYCtokenHolders(TOKEN_HOLDER, {from: TOKEN_HOLDER[0]})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("Set ERC1410 contract address", () => {
        it("should set erc1410 contract address", async () => {
          const erc1410Contract = await SecurityToken.erc1410Contract();

          assert.equal(
            erc1410Contract,
            ERC1410.address,
            "erc1410 contract address was not set properly"
          );
        });
      });

      describe("Set ERC1644 contract address", () => {
        it("should set erc1644 contract address", async () => {
          const erc1644Contract = await SecurityToken.erc1644Contract();

          assert.equal(
            erc1644Contract,
            ERC1644.address,
            "erc1644 contract address was not set properly"
          );
        });
      });

      describe("Set ERC1594 contract address", () => {
        it("should set erc1594 contract address", async () => {
          const erc1594Contract = await SecurityToken.erc1594Contract();

          assert.equal(
            erc1594Contract,
            ERC1594.address,
            "erc1594 contract address was not set properly"
          );
        });
      });

      describe("Set ERC1643 contract address", () => {
        it("should set erc1643 contract address", async () => {
          const erc1643Contract = await SecurityToken.erc1643Contract();

          assert.equal(
            erc1643Contract,
            ERC1643.address,
            "erc1643 contract address was not set properly"
          );
        });
      });

      describe("Set ERC20 contract address", () => {
        it("should set erc20 contract address", async () => {
          const erc20Contract = await SecurityToken.erc20Contract();

          assert.equal(
            erc20Contract,
            ERC20.address,
            "erc20 contract address was not set properly"
          );
        });
      });

      describe("Set Rules contract address", () => {
        it("should set rules contract address", async () => {
          const rulesContract = await SecurityToken.rulesContract();

          assert.equal(
            rulesContract,
            Rules.address,
            "rules contract address was not set properly"
          );
        });
      });

      describe("Set Certificate Token contract address", () => {
        it("should set certificate token contract address", async () => {
          const certificateTokenContract = await SecurityToken.certificateTokenContract();

          assert.equal(
            certificateTokenContract,
            CertificateToken.address,
            "certificate token contract address was not set properly"
          );
        });
      });

      describe("Set Certificate Controller contract address", () => {
        it("should set certificate controller contract address", async () => {
          const certificateControllerContract = await SecurityToken.certificateControllerContract();

          assert.equal(
            certificateControllerContract,
            CertificateController.address,
            "certificate controller contract address was not set properly"
          );
        });
      });
    });

    describe("Ownable", () => {
      describe("#transferOwnership - (issuer)", () => {
        it("issuer should transfer ownership", async () => {
          await SecurityToken.transferOwnership(ISSUER_2,{from: ISSUER_1});
          const issuer = await SecurityToken.issuer();
          assert.equal(issuer, ISSUER_2, "new issuer is not ser properly");
          await SecurityToken.transferOwnership(ISSUER_1,{from: ISSUER_2});
        });

        it("should emit *IssuerTransferred* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'IssuerTransferred');
          const decodedLog = logs.decode(SecurityToken, 'IssuerTransferred', encodedLogs);
          const expectedLog = {
            previousIssuer: ISSUER_2,
            newIssuer: ISSUER_1
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not issuer", async () => {
          await expect(
            SecurityToken.transferOwnership(ISSUER_2,{from: ISSUER_2})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should revert if new issuer address is 0x00", async () => {
          await expect(
            SecurityToken.transferOwnership(ZERO_ADDRESS, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x68"]);
        });
      });
    });

    describe("Controllabe", () => {
      describe("#authorizeController - (issuer)", () => {
        it("should authorize a new controller", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce
          });

          await SecurityToken.authorizeController(CONTROLLER_3, controllerData, {from: ISSUER_1});
          const isController = await SecurityToken.isController(CONTROLLER_3);
          assert.isTrue(isController, "Controller_3 was not authorized properly");
        });

        it("should emit *ControllerAuthorized* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'ControllerAuthorized');
          const decodedLog = logs.decode(SecurityToken, 'ControllerAuthorized', encodedLogs);
          const expectedLog = {
            issuer: ISSUER_1,
            newController: CONTROLLER_3
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not issuer", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.authorizeController(CONTROLLER_3, controllerData, {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should revert if invalid certificate (nonce)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce + 1
          });

          await expect(
            SecurityToken.authorizeController(CONTROLLER_3, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x76"]);
        });

        it("should revert if invalid certificate (params)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.authorizeController(CONTROLLER_2, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x75"]);
        });

        it("should revert if invalid certificate (token)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: Partitions.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.authorizeController(CONTROLLER_3, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x77"]);
        });

        it("should revert if invalid certificate (controller)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: ISSUER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.authorizeController(CONTROLLER_3, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x78"]);
        });

        it("should revert if new controller address is 0x00", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: ZERO_ADDRESS,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.authorizeController(ZERO_ADDRESS, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x68"]);
        });
      });

      describe("#revokeController - (issuer)", () => {
        it("should revert if invalid certificate (nonce)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_1,
            token: SecurityToken.address,
            nonce: nonce - 1
          });

          await expect(
            SecurityToken.revokeController(CONTROLLER_1, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x76"]);
        });

        it("should revert if invalid certificate (params)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_1,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.revokeController(CONTROLLER_2, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x75"]);
        });

        it("should revert if invalid certificate (token)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_1,
            token: Partitions.address,
            nonce: nonce - 1
          });

          await expect(
            SecurityToken.revokeController(CONTROLLER_1, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x77"]);
        });

        it("should revert if invalid certificate (controller)", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: ISSUER_1,
            newController: CONTROLLER_1,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.revokeController(CONTROLLER_1, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x78"]);
        });

        it("should revoke an existing controller", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce
          });

          await SecurityToken.revokeController(CONTROLLER_3, controllerData, {from: ISSUER_1});
          const isController = await SecurityToken.isController(CONTROLLER_3);
          assert.isFalse(isController, "Controller_3 was not set properly");
        });

        it("should emit *ControllerRevoked* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'ControllerRevoked');
          const decodedLog = logs.decode(SecurityToken, 'ControllerRevoked', encodedLogs);
          const expectedLog = {
            issuer: ISSUER_1,
            oldController: CONTROLLER_3
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not issuer", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_1,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.revokeController(CONTROLLER_1, controllerData, {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should revert if not existing controller", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.revokeController(CONTROLLER_3, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x65"]);
        });

        it("should revert if number of controllers goes under 2 controllers", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_1,
            token: SecurityToken.address,
            nonce: nonce
          });

          await expect(
            SecurityToken.revokeController(CONTROLLER_1, controllerData, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x79"]);
        });
      });

      describe("#renounceController (controller)", () => {
        it("should renounce an existing controller", async () => {
          const nonce = await SecurityToken.certificateControllerNonce();

          const controllerData = await getManagementControllerData({
            controller: CONTROLLER_1,
            newController: CONTROLLER_3,
            token: SecurityToken.address,
            nonce: nonce
          });

          await SecurityToken.authorizeController(CONTROLLER_3, controllerData, {from: ISSUER_1});

          await SecurityToken.renounceControl({from: CONTROLLER_3});

          const isController = await SecurityToken.isController(CONTROLLER_3);
          assert.isFalse(isController, "Controller_2 did not renounce properly");
        });

        it("should emit *ControllerResigned* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'ControllerResigned');
          const decodedLog = logs.decode(SecurityToken, 'ControllerResigned', encodedLogs);
          const expectedLog = {
            controller: CONTROLLER_3
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not a controller", async () => {
          await expect(
            SecurityToken.renounceControl({from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x65"]);
        });

        it("should revert if number of controllers goes under 2 controllers", async () => {
          await expect(
            SecurityToken.renounceControl({from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x79"]);
        });
      });
    });

    describe("ERC20", () => {
      describe("#setNav - (issuer)", () => {
        it("should set a new NAV", async () => {
          const expectedNewNav = 1*10**NAV_DECIMALS;
          await SecurityToken.setNav(expectedNewNav, {from: ISSUER_1});
          const newNav = await SecurityToken.nav();

          assert.equal(newNav, expectedNewNav, "new nav is not set properly");
        });

        it("should emit *NavSet* event", async () => {
          const newNav = 1*10**NAV_DECIMALS;
          const encodedLogs = await logs.get(SecurityToken, 'NavSet');
          const decodedLog = logs.decode(SecurityToken, 'NavSet', encodedLogs);
          const expectedLog = {
            nav: newNav.toString(),
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not issuer", async () => {
          const newNav = 1*10**NAV_DECIMALS;

          await expect(
            SecurityToken.setNav(newNav, {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("#setLotSize - (issuer)", () => {
        it("should set a new lot size", async () => {
          const expectedLotSize = 1000*10**TOKEN_DECIMALS;
          LOT_SIZE = expectedLotSize;
          await SecurityToken.setLotSize(expectedLotSize, {from: ISSUER_1});
          const newLotSize = await SecurityToken.lotSize();

          assert.equal(newLotSize, expectedLotSize, "new lot size is not set properly")
        });

        it("should emit *LotSizeSet* event", async () => {
          const newLotSize = 1000*10**TOKEN_DECIMALS;
          const encodedLogs = await logs.get(SecurityToken, 'LotSizeSet');
          const decodedLog = logs.decode(SecurityToken, 'LotSizeSet', encodedLogs);
          const expectedLog = {
            lotSize: newLotSize.toString(),
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not issuer", async () => {
          const newLotSize = 10000*10**TOKEN_DECIMALS;

          await expect(
            SecurityToken.setLotSize(newLotSize, {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });
    });

    describe("ERC1643", () => {
      describe("#getDocument - (everybody)", () => {
        it("should get a document info", async () => {
          const expectedDocument1 = initializeDocument("document_1");
          const document1 = await SecurityToken.getDocument(expectedDocument1.name);

          const uri = document1[0];
          const documentHash = document1[1];
          const timeStamp = Number(document1[2]);

          assert.deepEqual(
            {
              uri: uri,
              documentHash: documentHash
            },
            {
              uri: expectedDocument1.uri,
              documentHash: expectedDocument1.documentHash
            },
            "1. Document_1 was not got properly"
          );

          assert.isAtMost(timeStamp, NOW, "2. Document_1 was not got properly")
        });
      });

      describe("#getAllDocuments - (everybody)", () => {
        it("should get a document info", async () => {
            const documentList = await SecurityToken.getAllDocuments();

            assert.deepEqual(
              documentList,
              DOCUMENTS_LIST,
              "All documents were not got properly"
            );
        });
      });

      describe("#setDocument - (issuer & controller)", () => {
        it("should set a new document", async () => {
          const expectedDocument3 = initializeDocument("document_3");

          await SecurityToken.setDocument(
            expectedDocument3.name,
            expectedDocument3.uri,
            expectedDocument3.documentHash,
            {from: ISSUER_1}
          );

          pushDocument(expectedDocument3.name);

          const document3 = await SecurityToken.getDocument(expectedDocument3.name);

          const uri = document3[0];
          const documentHash = document3[1];
          const timeStamp = Number(document3[2]);

          assert.deepEqual(
            {
              uri: uri,
              documentHash: documentHash
            },
            {
              uri: expectedDocument3.uri,
              documentHash: expectedDocument3.documentHash
            },
            "1. Document_3 was not set properly"
          );

          const allDocuments = await SecurityToken.getAllDocuments();

          assert.deepEqual(
            allDocuments,
            DOCUMENTS_LIST,
            "2. Document_3 was not set properly"
          );
        });

        it("should emit *DocumentUpdated* event", async () => {
          const expectedDocument = initializeDocument("document_3");

          const encodedLogs = await logs.get(SecurityToken, 'DocumentUpdated');
          const decodedLog = logs.decode(SecurityToken, 'DocumentUpdated', encodedLogs);
          const expectedLog = {
            name: expectedDocument.name,
            uri: expectedDocument.uri,
            documentHash: expectedDocument.documentHash
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should update an existing document", async () => {
          const expectedDocument3 = initializeDocument("document_3");
          const document3 = await SecurityToken.getDocument(expectedDocument3.name);

          await SecurityToken.setDocument(
            expectedDocument3.name,
            expectedDocument3.uri,
            expectedDocument3.documentHash,
            {from: CONTROLLER_1}
          );

          const document3updated = await SecurityToken.getDocument(expectedDocument3.name);

          const uri = document3[0];
          const documentHash = document3[1];
          const timeStamp = Number(document3[2]);
          const timeStampUpdated = Number(document3updated[2]);

          assert.deepEqual(
            {
              uri: uri,
              documentHash: documentHash
            },
            {
              uri: expectedDocument3.uri,
              documentHash: expectedDocument3.documentHash
            },
            "1. Document_3 was not set properly"
          );

          assert.isAtLeast(timeStampUpdated, timeStamp, "2. Document_3 was not set properly");

          const allDocuments = await SecurityToken.getAllDocuments();

          assert.deepEqual(
            allDocuments,
            DOCUMENTS_LIST,
            "3. Document_3 was not set properly"
          );
        });

        it("should revert if not issuer or controller", async () => {
          const expectedDocument4 = initializeDocument("document_4");

          await expect(
            SecurityToken.setDocument(
              expectedDocument4.name,
              expectedDocument4.uri,
              expectedDocument4.documentHash,
              {from: TOKEN_HOLDER[0]}
            )
          ).to.eventually.be.rejectedWith(error["0x67"]);
        });
      });

      describe("#removeDocument - (issuer & controller)", () => {
        it("should remove existing documents", async () => {
          const expectedDocument2 = initializeDocument("document_2");
          await SecurityToken.removeDocument(expectedDocument2.name, {from: ISSUER_1});
          removeDocument(expectedDocument2.name);

          const expectedDocument3 = initializeDocument("document_3");
          await SecurityToken.removeDocument(expectedDocument3.name, {from: CONTROLLER_1});
          removeDocument(expectedDocument3.name);

          const allDocuments = await SecurityToken.getAllDocuments();

          assert.deepEqual(
            allDocuments,
            DOCUMENTS_LIST,
            "Document_2 was not removed properly"
          );
        });

        it("should emit *DocumentRemoved* event", async () => {
          const expectedDocument = initializeDocument("document_3");

          const encodedLogs = await logs.get(SecurityToken, 'DocumentRemoved');
          const decodedLog = logs.decode(SecurityToken, 'DocumentRemoved', encodedLogs);
          const expectedLog = {
            name: expectedDocument.name,
            uri: expectedDocument.uri,
            documentHash: expectedDocument.documentHash
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if document does not exist", async () => {
          const expectedDocument = initializeDocument("doesNotExist");
          await expect(
            SecurityToken.removeDocument(expectedDocument.name, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x70"]);
        });

        it("should revert if not issuer or controller", async () => {
          const expectedDocument1 = initializeDocument("document_1");
          await expect(
            SecurityToken.removeDocument(expectedDocument1.name, {from: TOKEN_HOLDER[0]})
          ).to.eventually.be.rejectedWith(error["0x67"]);
        });
      });
    });

    describe("ERC1410", () => {
      describe("#isOperator - (everybody)", () => {
        it("should return true if Operator is operator for a certain KYC token holder", async () => {
          await asyncForEach(TOKEN_HOLDER, async (tokenHolder) => {
            let isOperator = await SecurityToken.isOperator(OPERATOR_1, tokenHolder);
            assert.isTrue(isOperator, "operators are not athorized properly");
          });
        });

        it("should return false if a token holder is unKYC", async () => {
          const tokenHolderToUnKYC = TOKEN_HOLDER[TOKEN_HOLDER.length - 1];

          await SecurityToken.unKYCtokenHolders(
            [tokenHolderToUnKYC],
            {from: ISSUER_1}
          );

          let isOperator = await SecurityToken.isOperator(
            OPERATOR_1,
            tokenHolderToUnKYC
          );
          assert.isFalse(isOperator, "operators are not athorized properly");

          //restore state
          await SecurityToken.KYCtokenHolders(
            [tokenHolderToUnKYC],
            {from: ISSUER_1}
          );
        });
      });

      describe("#authorizeOperator - (issuer)", () => {
        it("should authorize an operator", async () => {
          await SecurityToken.KYCtokenHolders(NEW_TOKEN_HOLDERS, {from: ISSUER_1});
          await SecurityToken.authorizeOperator(
            NEW_OPERATOR,
            NEW_TOKEN_HOLDERS,
            {from: ISSUER_1}
          );

          await asyncForEach(NEW_TOKEN_HOLDERS, async (tokenHolder) => {
            let isOperator = await SecurityToken.isOperator(NEW_OPERATOR, tokenHolder);
            assert.isTrue(isOperator, "operators are not athorized properly");
          });
        });

        it("should emit *AuthorizedOperator* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'AuthorizedOperator');
          const decodedLog = logs.decode(SecurityToken, 'AuthorizedOperator', encodedLogs);
          const expectedLog = {
            operator: NEW_OPERATOR,
            tokenHolder: NEW_TOKEN_HOLDERS[NEW_TOKEN_HOLDERS.length - 1]
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if address 0x00", async () => {
          await expect(
            SecurityToken.authorizeOperator(
              ZERO_ADDRESS,
              NEW_TOKEN_HOLDERS,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x68"]);
        });

        it("should revert if operator already exist", async () => {
          await expect(
            SecurityToken.authorizeOperator(
              NEW_OPERATOR,
              NEW_TOKEN_HOLDERS,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x69"]);
        });

        it("should revert if not issuer", async () => {
          await expect(
            SecurityToken.authorizeOperator(
              NEW_OPERATOR,
              NEW_TOKEN_HOLDERS,
              {from: TOKEN_HOLDER[0]}
            )
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("#revokeOperator - (issuer)", () => {
        it("should revoke an operator", async () => {
          await asyncForEach(NEW_TOKEN_HOLDERS, async (tokenHolder) => {
            let isOperator1 = await SecurityToken.isOperator(NEW_OPERATOR, tokenHolder);
            assert.isTrue(isOperator1);
          });

          await SecurityToken.revokeOperator(
            NEW_OPERATOR,
            NEW_TOKEN_HOLDERS,
            {from: ISSUER_1}
          );

          await asyncForEach(NEW_TOKEN_HOLDERS, async (tokenHolder) => {
            let isOperator2 = await SecurityToken.isOperator(NEW_OPERATOR, tokenHolder);
            assert.isFalse(isOperator2, "operators are not revoked properly");
          });
        });

        it("should emit *RevokedOperator* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'RevokedOperator');
          const decodedLog = logs.decode(SecurityToken, 'RevokedOperator', encodedLogs);
          const expectedLog = {
            operator: NEW_OPERATOR,
            tokenHolder: NEW_TOKEN_HOLDERS[NEW_TOKEN_HOLDERS.length - 1]
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if address 0x00", async () => {
          await expect(
            SecurityToken.revokeOperator(
              ZERO_ADDRESS,
              NEW_TOKEN_HOLDERS,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x68"]);
        });

        it("should revert if operator does not exist", async () => {
          await expect(
            SecurityToken.revokeOperator(
              CONTROLLER_1,
              NEW_TOKEN_HOLDERS,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x64"]);
        });

        it("should revert if not issuer", async () => {
          await expect(
            SecurityToken.revokeOperator(
              NEW_OPERATOR,
              NEW_TOKEN_HOLDERS,
              {from: TOKEN_HOLDER[0]}
            )
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("#issueByPartition - (issuer)", () => {
        it("should issue value to token holders", async () => {
          await asyncForEach(ISSUANCES, async (issuance) => {
            await SecurityToken.issueByPartition(
              issuance.partition,
              issuance.tokenHolder,
              issuance.value,
              ZERO_32BYTES,
              {from: ISSUER_1}
            );
          });

          const token = await Partitions.token();

          let value;
          let partitions = [];
          let balanceOfByPartition = {};
          let totalSupplyByPartition = {};

          //Generate balanceOfByPartition[tokenHolder][partition] Object
          for(let i=0; i < ISSUANCES.length; i++) {
            let tokenHolder = ISSUANCES[i].tokenHolder;
            let partition = ISSUANCES[i].partition;
            let value = ISSUANCES[i].value;

            if(!balanceOfByPartition[tokenHolder]) {
              balanceOfByPartition[tokenHolder] = {};
            }

            if(!balanceOfByPartition[tokenHolder][partition]) {
              balanceOfByPartition[tokenHolder][partition] = 0;
            }

            balanceOfByPartition[tokenHolder][partition] += value;

            if(partitions.indexOf(partition) == -1) {
              partitions.push(partition);
            }
          }

          //Iterate balanceOfByPartition[tokenHolder][partition] to assert it and
          //calculate the rest of results:
          // - balanceOfByPartition
          // - balanceOf
          // - totalSupplyByPartition
          // - totalSupply
          // - partitionsOf
          // - totalPartitions

          for(let tokenHolder in balanceOfByPartition) {
            let balanceOf = 0;
            let partitionsOf = [];

            for(let partition in balanceOfByPartition[tokenHolder]) {
              const expectedBalanceOfByPartition = await SecurityToken.balanceOfByPartition(
                partition,
                tokenHolder
              );

              assert.equal(
                expectedBalanceOfByPartition,
                balanceOfByPartition[tokenHolder][partition],
                "tokens are not issued properly to token holders (balanceOfByPartition)"
              );

              balanceOf += balanceOfByPartition[tokenHolder][partition];

              if(!totalSupplyByPartition[partition]) {
                totalSupplyByPartition[partition] = 0;
              }

              totalSupplyByPartition[partition] += balanceOfByPartition[tokenHolder][partition];

              if(partitionsOf.indexOf(partition) == -1) {
                partitionsOf.push(partition);
              }
            }

            const expectedBalanceOf = await SecurityToken.balanceOf(tokenHolder);

            assert.equal(
              expectedBalanceOf,
              balanceOf,
              "tokens are not issued properly to token holders (balanceOf)"
            );

            const expectedPartitionsOf = await SecurityToken.partitionsOf(tokenHolder);

            assert.deepEqual(
              expectedPartitionsOf,
              partitionsOf,
              "tokens are not issued properly to token holders (partitionsOf)"
            );
          }

          for(i in partitions) {
            const expectedTotalSupplyByPartition = await SecurityToken.totalSupplyByPartition(partitions[i]);

            assert.equal(
              expectedTotalSupplyByPartition,
              totalSupplyByPartition[partitions[i]],
              "tokens are not issued properly to token holders (totalSupplyByPartition)"
            );
          }

          totalSupply = 0;

          for(partition in totalSupplyByPartition) {
            totalSupply += totalSupplyByPartition[partition];
          }

          const expectedTotalSupply = await SecurityToken.totalSupply();

          assert.equal(
            expectedTotalSupply,
            totalSupply,
            "tokens are not issued properly to token holders (totalSupply)"
          );

          const expectedPartitions = await SecurityToken.totalPartitions();

          assert.deepEqual(
            expectedPartitions,
            partitions,
            "tokens are not issued properly to token holders (partitions)"
          );
        });

        it("should emit *IssuedByPartition* event", async () => {
          const issuance = ISSUANCES[ISSUANCES.length - 1];

          const encodedLogs = await logs.get(SecurityToken, 'IssuedByPartition');
          const decodedLog = logs.decode(SecurityToken, 'IssuedByPartition', encodedLogs);

          const expectedLog = {
            partition: issuance.partition,
            operator: ISSUER_1,
            to: issuance.tokenHolder,
            amount: issuance.value.toString(),
            data: ZERO_32BYTES,
            operatorData: ZERO_32BYTES
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if partition does not exist", async () => {
          const issuance = ISSUANCES[0];

          await expect(
            SecurityToken.issueByPartition(
              INVALID_PARTITION,
              issuance.tokenHolder,
              issuance.value,
              ZERO_32BYTES,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x59"]);
        });

        it("should revert if not issuer", async () => {
          const issuance = ISSUANCES[0];

          await expect(
            SecurityToken.issueByPartition(
              issuance.partition,
              issuance.tokenHolder,
              issuance.value,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[0]}
            )
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should revert if value < issuance floor ($100k)", async () => {
          const issuance = ISSUANCES[0];

          await expect(
            SecurityToken.issueByPartition(
              issuance.partition,
              issuance.tokenHolder,
              seed.issuanceFloor[0]*10**TOKEN_DECIMALS - 1,
              ZERO_32BYTES,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x61"]);
        });

        it("should revert if invalid granularity ($10k)", async () => {
          const issuance = ISSUANCES[0];

          await expect(
            SecurityToken.issueByPartition(
              issuance.partition,
              issuance.tokenHolder,
              seed.issuanceFloor[0]*10**TOKEN_DECIMALS + (seed.granularity[0]/2)*10**TOKEN_DECIMALS,
              ZERO_32BYTES,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x62"]);
        });

        it("should revert if invalid token holder", async () => {
          const issuance = ISSUANCES[0];

          await expect(
            SecurityToken.issueByPartition(
              issuance.partition,
              ISSUER_1,
              issuance.value,
              ZERO_32BYTES,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x57"]);
        });
      });

      describe("#operatorTransferByPartition - (operator)", () => {
        it("should revert if lockup period did not expired (first default partition lockup transfer expiration time is ### 1 July 2019 ###))", async () =>  {

          printCurrentDate();

          await expect(
            SecurityToken.operatorTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[2],
              TOKEN_HOLDER[0],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: OPERATOR_1})
          ).to.eventually.be.rejectedWith(error["0x55"]);
        });

        it("should transfer (Time travelled to ### 1 July 2019 ###)", async () => {
          //Time travel after lockup period
          const lastBlock = await web3.eth.getBlock("latest");
          const time = seed.lockupTransferTimestamps[0] - lastBlock.timestamp;
          timeTravelFuture(time);
          mineBlock();
          printCurrentDate();

          const initialBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const initialBalanceOfByPartition2  = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[2]
          );

          const initialBalanceOf0 = await SecurityToken.balanceOf(TOKEN_HOLDER[0]);
          const initialBalanceOf2 = await SecurityToken.balanceOf(TOKEN_HOLDER[2]);

          await SecurityToken.operatorTransferByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[2],
            TOKEN_HOLDER[0],
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            ZERO_32BYTES
          , {from: OPERATOR_1});

          const finalBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const finalBalanceOfByPartition2  = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[2]
          );

          const finalBalanceOf0 = await SecurityToken.balanceOf(TOKEN_HOLDER[0]);
          const finalBalanceOf2 = await SecurityToken.balanceOf(TOKEN_HOLDER[2]);

          assert.equal(
            Number(finalBalanceOfByPartition0),
            Number(initialBalanceOfByPartition0) + DEFAULT_TOKEN_VALUE,
            "1. operator transfer is not done properly - sender does not gain tokens"
          );

          assert.equal(
            Number(finalBalanceOf0),
            Number(initialBalanceOf0) + DEFAULT_TOKEN_VALUE,
            "2. operator transfer is not done properly - sender does not gain tokens"
          );

          assert.equal(
            Number(finalBalanceOfByPartition2),
            Number(initialBalanceOfByPartition2) - DEFAULT_TOKEN_VALUE,
            "3. operator transfer is not done properly - receiver does not lose tokens"
          );

          assert.equal(
            Number(finalBalanceOf2),
            Number(initialBalanceOf2) - DEFAULT_TOKEN_VALUE,
            "4. operator transfer is not done properly - receiver does not lose tokens"
          );
        });

        it("should emit *TransferByPartition* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'TransferByPartition');
          const decodedLog = logs.decode(SecurityToken, 'TransferByPartition', encodedLogs);

          const expectedLog = {
            fromPartition: DEFAULT_PARTITIONS[0],
            operator: OPERATOR_1,
            from: TOKEN_HOLDER[2],
            to: TOKEN_HOLDER[0],
            value: DEFAULT_TOKEN_VALUE.toString(),
            data: ZERO_32BYTES,
            operatorData: ZERO_32BYTES
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should remove partition from sender and add it to receiver (if all partition value transfered)", async () => {
          const sender = TOKEN_HOLDER[0];
          const receiver = TOKEN_HOLDER[1];

          //Issue first the new partition
          await SecurityToken.issueByPartition(
            NEW_PARTITION_1,
            TOKEN_HOLDER[0],
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            {from: ISSUER_1}
          );

          const initialPartitionsOfSender = await SecurityToken.partitionsOf(sender);
          const initialPartitionsOfReceiver = await SecurityToken.partitionsOf(receiver);

          //Transfer all value of that partition to another token holder
          await SecurityToken.operatorTransferByPartition(
            NEW_PARTITION_1,
            sender,
            receiver,
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            ZERO_32BYTES,
            {from: OPERATOR_1}
          );

          const finalPartitionsOfSender = await SecurityToken.partitionsOf(sender);
          const finalPartitionsOfReceiver = await SecurityToken.partitionsOf(receiver);

          assert.isTrue(
            initialPartitionsOfSender.includes(NEW_PARTITION_1),
            "1. does not remove and add partitions properly"
          );

          assert.isFalse(
            initialPartitionsOfReceiver.includes(NEW_PARTITION_1),
            "2. does not remove and add partitions properly"
          );

          assert.isTrue(
            finalPartitionsOfReceiver.includes(NEW_PARTITION_1),
            "3. does not remove and add partitions properly"
          );

          assert.isFalse(
            finalPartitionsOfSender.includes(NEW_PARTITION_1),
            "4. does not remove and add partitions properly"
          );

          assert.deepEqual(
            finalPartitionsOfReceiver,
            initialPartitionsOfSender,
            "5. does not remove and add partitions properly"
          );


        });

        it("should revert if not enough value to transfer", async () => {
          const balance = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[2]
          );

          await expect(
            SecurityToken.operatorTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[2],
              TOKEN_HOLDER[0],
              Number(balance) + LOT_SIZE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: OPERATOR_1})
          ).to.eventually.be.rejectedWith(error["0x52"]);
        });

        it("should revert if invalid partition to transfer does not exist", async () => {
          await expect(
            SecurityToken.operatorTransferByPartition(
              INVALID_PARTITION,
              TOKEN_HOLDER[2],
              TOKEN_HOLDER[0],
              1,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: OPERATOR_1})
          ).to.eventually.be.rejectedWith(error["0x59"]);
        });

        it("should revert if transfer 0 value", async () => {
          await expect(
            SecurityToken.operatorTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[2],
              TOKEN_HOLDER[0],
              0,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: OPERATOR_1})
          ).to.eventually.be.rejectedWith(error["0x58"]);
        });

        it("should revert if invalid transfer lot size", async () => {
          await expect(
            SecurityToken.operatorTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[2],
              TOKEN_HOLDER[0],
              DEFAULT_TOKEN_VALUE - LOT_SIZE/2,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: OPERATOR_1})
          ).to.eventually.be.rejectedWith(error["0x60"]);
        });

        it("should revert if invalid sender", async () => {
          await expect(
            SecurityToken.operatorTransferByPartition(
              DEFAULT_PARTITIONS[0],
              CONTROLLER_1,
              TOKEN_HOLDER[0],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: OPERATOR_1})
          ).to.eventually.be.rejectedWith(error["0x56"]);
        });

        it("should revert if invalid receiver", async () => {
          await expect(
            SecurityToken.operatorTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[2],
              CONTROLLER_1,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: OPERATOR_1})
          ).to.eventually.be.rejectedWith(error["0x57"]);
        });

        it("should revert if not a operator", async () => {
          await expect(
            SecurityToken.operatorTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[2],
              TOKEN_HOLDER[0],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[1]})
          ).to.eventually.be.rejectedWith(error["0x64"]);
        });
      });

      describe("#operatorRedeemByPartition - (issuer)", () => {
        it("should revert if lockup period did not expired (first default partition lockup expiration time is ### 1 September 2020 ###)", async () =>  {
          printCurrentDate();

          await expect(
            SecurityToken.operatorRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x55"]);
        });

        it("should redeem (Time travelled to ### 1 September 2020 ###)", async () => {
          //Time travel after lockup period
          const lastBlock = await web3.eth.getBlock("latest");
          const time = seed.lockupRedemptionTimestamps[0] - lastBlock.timestamp;
          timeTravelFuture(time);
          mineBlock();
          printCurrentDate();

          const initialBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const initialBalanceOf0 = await SecurityToken.balanceOf(TOKEN_HOLDER[0]);
          const initialSuplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const initialSuply = await SecurityToken.totalSupply();

          await SecurityToken.operatorRedeemByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0],
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            {from: ISSUER_1});

          const finalBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const finalBalanceOf0 = await SecurityToken.balanceOf(TOKEN_HOLDER[0]);
          const finalSuplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const finalSuply = await SecurityToken.totalSupply();

          assert.equal(
            Number(finalBalanceOfByPartition0),
            Number(initialBalanceOfByPartition0) - DEFAULT_TOKEN_VALUE,
            "1. issuer redeem is not done properly - token holder does not lose tokens"
          );

          assert.equal(
            Number(finalBalanceOf0),
            Number(initialBalanceOf0) - DEFAULT_TOKEN_VALUE,
            "2. issuer redeem is not done properly - token holder does not lose tokens"
          );

          assert.equal(
            Number(finalSuplyByPartition),
            Number(initialSuplyByPartition) - DEFAULT_TOKEN_VALUE,
            "3. issuer redeem is not done properly - token holder does not lose tokens"
          );

          assert.equal(
            Number(finalSuply),
            Number(initialSuply) - DEFAULT_TOKEN_VALUE,
            "4. issuer redeem is not done properly - token holder does not lose tokens"
          );
        });

        it("should emit *RedeemedByPartition* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'RedeemedByPartition');
          const decodedLog = logs.decode(SecurityToken, 'RedeemedByPartition', encodedLogs);

          const expectedLog = {
            partition: DEFAULT_PARTITIONS[0],
            operator: ISSUER_1,
            from: TOKEN_HOLDER[0],
            amount: DEFAULT_TOKEN_VALUE.toString(),
            operatorData: ZERO_32BYTES
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should remove partition if all its tokens are redeemed", async () => {
          await issueNewPartition(
            SecurityToken,
            NEW_PARTITION_2,
            DEFAULT_TOKEN_VALUE,
            TOKEN_HOLDER[0],
            ZERO_32BYTES
          );

          const initialIsPartition = await Partitions.isPartition(NEW_PARTITION_2);
          const initialTotalPartitions = await SecurityToken.totalPartitions();
          const initialTokenHolderPartitions = await SecurityToken.partitionsOf(TOKEN_HOLDER[0]);

          assert.isTrue(initialIsPartition);
          assert.isTrue(initialTotalPartitions.includes(NEW_PARTITION_2));
          assert.isTrue(initialTokenHolderPartitions.includes(NEW_PARTITION_2));

          await SecurityToken.operatorRedeemByPartition(
            NEW_PARTITION_2,
            TOKEN_HOLDER[0],
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            {from: ISSUER_1});

          const finalIsPartition = await Partitions.isPartition(NEW_PARTITION_2);
          const finalTotalPartitions = await SecurityToken.totalPartitions();
          const finalTokenHolderPartitions = await SecurityToken.partitionsOf(TOKEN_HOLDER[0]);

          assert.isFalse(
            finalIsPartition,
            "1. partition is not removed if all its tokens are redeemed"
          );

          assert.isFalse(
            finalTotalPartitions.includes(NEW_PARTITION_2),
            "2. partition is not removed if all its tokens are redeemed"
          );
          assert.isFalse(
            finalTokenHolderPartitions.includes(NEW_PARTITION_2),
            "3. partition is not removed if all its tokens are redeemed"
          );

          const value = await Partitions.getValue(
            NEW_PARTITION_2,
            seed.partitionVariables[0].key
          );

          assert.equal(
            value,
            ZERO_32BYTES,
            "3. partition is not removed if all its tokens are redeemed"
          );
        });

        it("should emit *PartitionRemoved* event", async () => {
          const encodedLogs = await logs.get(Partitions, 'PartitionRemoved');
          const decodedLog = logs.decode(Partitions, 'PartitionRemoved', encodedLogs);

          const expectedLog = {
            partition: NEW_PARTITION_2
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not enough value to redeem", async () => {
          const balance = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          await expect(
            SecurityToken.operatorRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              Number(balance) + 1,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x52"]);
        });

        it("should revert if invalid partition to redeem", async () => {
          await expect(
            SecurityToken.operatorRedeemByPartition(
              INVALID_PARTITION,
              TOKEN_HOLDER[0],
              1,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x59"]);
        });

        it("should revert if redeem 0 value", async () => {
          await expect(
            SecurityToken.operatorRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              0,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x58"]);
        });

        it("should revert if invalid token holder", async () => {
          await expect(
            SecurityToken.operatorRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              ISSUER_1,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x56"]);
        });

        it("should revert if not a issuer", async () => {
          await expect(
            SecurityToken.operatorRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[0]})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });
    });

    describe("ERC1644", () => {
      describe("#isControllable - (everybody)", () => {
        it("should be always controllable", async () => {
          const controllable = await SecurityToken.isControllable();
          assert.equal(controllable, true, "token is not controllable")
        });
      });

      describe("#controllerTransferByPartition - (controller)", () => {
        it("should force transfer", async () => {
          mineBlock();
          printCurrentDate();
          const initialPartitions0 = await SecurityToken.partitionsOf(TOKEN_HOLDER[0]);

          const initialPartitions1 = await SecurityToken.partitionsOf(TOKEN_HOLDER[1]);

          const initialBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const initialBalanceOfByPartition1  = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          const initialBalanceOf0 = await SecurityToken.balanceOf(TOKEN_HOLDER[0]);

          const initialBalanceOf1 = await SecurityToken.balanceOf(TOKEN_HOLDER[1]);

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              partition: DEFAULT_PARTITIONS[0],
              token: SecurityToken.address,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await SecurityToken.controllerTransferByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0],
            TOKEN_HOLDER[1],
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            controllerData
          , {from: CONTROLLER_1});

          const finalBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const finalBalanceOfByPartition1  = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          const finalBalanceOf0 = await SecurityToken.balanceOf(TOKEN_HOLDER[0]);

          const finalBalanceOf1 = await SecurityToken.balanceOf(TOKEN_HOLDER[1]);

          const finalPartitions0 = await SecurityToken.partitionsOf(TOKEN_HOLDER[0]);

          const finalPartitions1 = await SecurityToken.partitionsOf(TOKEN_HOLDER[1]);

          assert.equal(
            Number(finalBalanceOfByPartition0),
            Number(initialBalanceOfByPartition0) - DEFAULT_TOKEN_VALUE,
            "1. controller transfer is not done properly - sender does not lose tokens"
          );

          assert.equal(
            Number(finalBalanceOf0),
            Number(initialBalanceOf0) - DEFAULT_TOKEN_VALUE,
            "2. controller transfer is not done properly - sender does not lose tokens"
          );

          assert.equal(
            Number(finalBalanceOfByPartition1),
            Number(initialBalanceOfByPartition1) + DEFAULT_TOKEN_VALUE,
            "3. controller transfer is not done properly - receiver does not gain tokens"
          );

          assert.equal(
            Number(finalBalanceOf1),
            Number(initialBalanceOf1) + DEFAULT_TOKEN_VALUE,
            "4. controller transfer is not done properly - receiver does not gain tokens"
          );
        });

        it("should emit *ControllerTransferByPartition* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'ControllerTransferByPartition');
          const decodedLog = logs.decode(SecurityToken, 'ControllerTransferByPartition', encodedLogs);

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce - 1
            }
          );

          const expectedLog = {
            partition: DEFAULT_PARTITIONS[0],
            controller: CONTROLLER_1,
            from: TOKEN_HOLDER[0],
            to: TOKEN_HOLDER[1],
            value: DEFAULT_TOKEN_VALUE.toString(),
            data: ZERO_32BYTES,
            controllerData: controllerData
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if invalid certificate (nonce)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce + 1
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x76"]);
        });

        it("should revert if invalid certificate (params)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[2],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x75"]);
        });

        it("should revert if invalid certificate (token)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: Partitions.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x77"]);
        });

        it("should revert if invalid certificate (controller)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_1,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x78"]);
        });

        it("should revert if not enough value to transfer", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const balance = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: Number(balance) + 1,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              Number(balance) + 1,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x52"]);
        });

        it("should revert if invalid partition to transfer", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: INVALID_PARTITION,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: 1,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              INVALID_PARTITION ,
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              1,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x59"]);
        });

        it("should revert if transfer 0 value", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: 0,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              0,
              ZERO_32BYTES,
              controllerData
            , {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x58"]);
        });

        it("should revert if invalid sender", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: CONTROLLER_1,
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              CONTROLLER_1,
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x56"]);
        });

        it("should revert if invalid receiver", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: CONTROLLER_1,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              CONTROLLER_1,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x57"]);
        });

        it("should revert if not a controller", async () => {
          await expect(
            SecurityToken.controllerTransferByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[1]})
          ).to.eventually.be.rejectedWith(error["0x65"]);
        });
      });

      describe("#controllerTransfer - (controller)", () => {
        it("should transfer value from first default partition only", async () => {
          const initialTokenHolderBalance0 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[0]);
          const initialTokenHolderBalance1 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);

          const valueFromPartition0ToTransfer = initialTokenHolderBalance0[DEFAULT_PARTITIONS[0]]/2;

          const initialBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const initialBalanceOfByPartition1 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: valueFromPartition0ToTransfer,
              nonce: nonce
            }
          );

          await SecurityToken.controllerTransfer(
            TOKEN_HOLDER[0],
            TOKEN_HOLDER[1],
            valueFromPartition0ToTransfer,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1}
          );

          const finalTokenHolderBalance0 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[0]);
          const finalTokenHolderBalance1 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);

          //update expected values
          let expectedTokenHolderBalance0 = Object.assign({}, initialTokenHolderBalance0);
          expectedTokenHolderBalance0[DEFAULT_PARTITIONS[0]] -= valueFromPartition0ToTransfer;

          let expectedTokenHolderBalance1 = Object.assign({}, initialTokenHolderBalance1);
          expectedTokenHolderBalance1[DEFAULT_PARTITIONS[0]] += valueFromPartition0ToTransfer;

          assert.deepEqual(
            finalTokenHolderBalance0,
            expectedTokenHolderBalance0,
            "1. tokens are not sent properly"
          )

          assert.deepEqual(
            finalTokenHolderBalance1,
            expectedTokenHolderBalance1,
            "2. tokens are not received properly"
          )

          const finalBalanceOfByPartition0 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const finalBalanceOfByPartition1 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          assert.deepEqual(
            Number(finalBalanceOfByPartition0),
            Number(initialBalanceOfByPartition0) - valueFromPartition0ToTransfer,
            "3. tokens are not sent properly"
          )

          assert.deepEqual(
            Number(finalBalanceOfByPartition1),
            Number(initialBalanceOfByPartition1) + valueFromPartition0ToTransfer,
            "4. tokens are not sent properly"
          )

          //restore initial state
          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[0],
            valueFromPartition0ToTransfer,
            TOKEN_HOLDER[0],
            ZERO_32BYTES
          );
        });

        it("should emit *ControllerTransfer* event", async () => {
          const initialTokenHolderBalance0 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[0]);

          const valueFromPartition0ToTransfer = initialTokenHolderBalance0[DEFAULT_PARTITIONS[0]]/2;

          const encodedLogs = await logs.get(SecurityToken, 'ControllerTransfer');
          const decodedLog = logs.decode(SecurityToken, 'ControllerTransfer', encodedLogs);

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: valueFromPartition0ToTransfer,
              nonce: nonce - 1
            }
          );

          const expectedLog = {
            controller: CONTROLLER_1,
            from: TOKEN_HOLDER[0],
            to: TOKEN_HOLDER[1],
            value: valueFromPartition0ToTransfer.toString(),
            data: ZERO_32BYTES,
            controllerData: controllerData
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should transfer value from first and second default partitions", async () => {
          const initialTokenHolderBalance0 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[0]);
          const initialTokenHolderBalance1 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);

          const valueFromPartition0ToTransfer = initialTokenHolderBalance0[DEFAULT_PARTITIONS[0]];
          const valueFromPartition1ToTransfer = initialTokenHolderBalance0[DEFAULT_PARTITIONS[1]]/2;

          const initialBalanceOfByPartition00 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const initialBalanceOfByPartition10 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[1],
            TOKEN_HOLDER[0]
          );

          const initialBalanceOfByPartition01 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          const initialBalanceOfByPartition11 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[1],
            TOKEN_HOLDER[1]
          );

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: valueFromPartition0ToTransfer + valueFromPartition1ToTransfer,
              nonce: nonce
            }
          );

          await SecurityToken.controllerTransfer(
            TOKEN_HOLDER[0],
            TOKEN_HOLDER[1],
            valueFromPartition0ToTransfer + valueFromPartition1ToTransfer,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1}
          );

          const finalTokenHolderBalance0 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[0]);
          const finalTokenHolderBalance1 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);

          //update expected values
          let expectedTokenHolderBalance0 = Object.assign({}, initialTokenHolderBalance0);
          delete expectedTokenHolderBalance0[DEFAULT_PARTITIONS[0]];
          expectedTokenHolderBalance0[DEFAULT_PARTITIONS[1]] -= initialTokenHolderBalance0[DEFAULT_PARTITIONS[1]]/2;

          let expectedTokenHolderBalance1 = Object.assign({}, initialTokenHolderBalance1);
          expectedTokenHolderBalance1[DEFAULT_PARTITIONS[0]] += initialTokenHolderBalance0[DEFAULT_PARTITIONS[0]];
          expectedTokenHolderBalance1[DEFAULT_PARTITIONS[1]] += initialTokenHolderBalance0[DEFAULT_PARTITIONS[1]]/2;

          assert.deepEqual(
            finalTokenHolderBalance0,
            expectedTokenHolderBalance0,
            "1. tokens are not sent properly"
          );

          assert.deepEqual(
            finalTokenHolderBalance1,
            expectedTokenHolderBalance1,
            "2. tokens are not received properly"
          );

          const finalBalanceOfByPartition00 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[0]
          );

          const finalBalanceOfByPartition10 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[1],
            TOKEN_HOLDER[0]
          );

          const finalBalanceOfByPartition01 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          const finalBalanceOfByPartition11 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[1],
            TOKEN_HOLDER[1]
          );

          assert.deepEqual(
            Number(finalBalanceOfByPartition00),
            0,
            "3. tokens are not received properly"
          );

          assert.deepEqual(
            Number(finalBalanceOfByPartition10),
            Number(initialBalanceOfByPartition10) - valueFromPartition1ToTransfer,
            "4. tokens are not received properly"
          );

          assert.deepEqual(
            Number(finalBalanceOfByPartition01),
            Number(initialBalanceOfByPartition01) + valueFromPartition0ToTransfer,
            "5. tokens are not received properly"
          );

          assert.deepEqual(
            Number(finalBalanceOfByPartition11),
            Number(initialBalanceOfByPartition11) + valueFromPartition1ToTransfer,
            "6. tokens are not received properly"
          );

          //restore initial state
          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[0],
            valueFromPartition0ToTransfer,
            TOKEN_HOLDER[0],
            ZERO_32BYTES
          );

          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[1],
            valueFromPartition1ToTransfer,
            TOKEN_HOLDER[0],
            ZERO_32BYTES
          );
        });

        it("tranfer all the partitions with the exception of the one which is not default", async () => {
          await issueNewPartition(
            SecurityToken,
            NEW_PARTITION_1,
            DEFAULT_TOKEN_VALUE,
            TOKEN_HOLDER[0],
            ZERO_32BYTES
          );

          const initialTokenHolderBalance0 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[0]);
          const initialTokenHolderBalance1 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);

          const defaultPartitions = await SecurityToken.getDefaultPartitions();

          let totalDefaultPartitionsValue = 0;

          defaultPartitions.forEach( partition => {
            totalDefaultPartitionsValue += initialTokenHolderBalance0[partition];
          });

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: totalDefaultPartitionsValue,
              nonce: nonce
            }
          );

          await SecurityToken.controllerTransfer(
            TOKEN_HOLDER[0],
            TOKEN_HOLDER[1],
            totalDefaultPartitionsValue,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1}
          );

          const finalTokenHolderBalance0 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[0]);
          const finalTokenHolderBalance1 = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);

          //update expected values
          let expectedTokenHolderBalance0 = Object.assign({}, initialTokenHolderBalance0);
          let expectedTokenHolderBalance1 = Object.assign({}, initialTokenHolderBalance1);

          defaultPartitions.forEach( partition => {
            delete expectedTokenHolderBalance0[partition];
            expectedTokenHolderBalance1[partition] += initialTokenHolderBalance0[partition];
          });
          expectedTokenHolderBalance0[NEW_PARTITION_1] = DEFAULT_TOKEN_VALUE;

          assert.deepEqual(
            finalTokenHolderBalance0,
            expectedTokenHolderBalance0,
            "tokens are not sent properly"
          );

          assert.deepEqual(
            finalTokenHolderBalance1,
            expectedTokenHolderBalance1,
            "tokens are not received properly"
          );

          //restore initial state
          let i=0;
          await asyncForEach(defaultPartitions, async partition  => {
            await issueNewPartition(
              SecurityToken,
              partition,
              initialTokenHolderBalance0[partition],
              TOKEN_HOLDER[0],
              ZERO_32BYTES
            );
            i++;
          });
        });

        it("should revert if invalid certificate (nonce)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce + 1
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x76"]);
        });

        it("should revert if invalid certificate (params)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[2],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x75"]);
        });

        it("should revert if invalid certificate (token)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: Partitions.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x77"]);
        });

        it("should revert if invalid certificate (controller)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_1,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x78"]);
        });

        it("should revert if not enough value to transfer", async () => {
          const balance = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: Number(balance) + 1,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              Number(balance) + 1,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x52"]);
        });

        it("should revert if transfer 0 value", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: 0,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              0,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x58"]);
        });

        it("should revert if invalid sender", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: CONTROLLER_1,
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              CONTROLLER_1,
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x56"]);
        });

        it("should revert if invalid receiver", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[0],
              to: CONTROLLER_1,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              CONTROLLER_1,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x57"]);
        });

        it("should revert if not a controller", async () => {
          await expect(
            SecurityToken.controllerTransfer(
              TOKEN_HOLDER[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[1]})
          ).to.eventually.be.rejectedWith(error["0x65"]);
        });
      });

      describe("#controllerRedeemByPartition - (controller)", () => {
        it("should force redemption even if lockup period has not expired yet (second default partition lockup expiration time is ### 1 October 2020 ###)", async () => {
          printCurrentDate();

          const initialBalanceOfByPartition1 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[1],
            TOKEN_HOLDER[1]
          );

          const initialBalanceOf1 = await SecurityToken.balanceOf(TOKEN_HOLDER[1]);
          const initialSuplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const initialSuply = await SecurityToken.totalSupply();

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[1],
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await SecurityToken.controllerRedeemByPartition(
            DEFAULT_PARTITIONS[1],
            TOKEN_HOLDER[1],
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1});

          const finalBalanceOfByPartition1 = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[1],
            TOKEN_HOLDER[1]
          );

          const finalBalanceOf1 = await SecurityToken.balanceOf(TOKEN_HOLDER[1]);
          const finalSuplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const finalSuply = await SecurityToken.totalSupply();

          assert.equal(
            Number(finalBalanceOfByPartition1),
            Number(initialBalanceOfByPartition1) - DEFAULT_TOKEN_VALUE,
            "1. controller redeem is not done properly - token holder does not lose tokens"
          );

          assert.equal(
            Number(finalBalanceOf1),
            Number(initialBalanceOf1) - DEFAULT_TOKEN_VALUE,
            "2. controller redeem is not done properly - token holder does not lose tokens"
          );

          assert.equal(
            Number(finalSuplyByPartition),
            Number(initialSuplyByPartition) - DEFAULT_TOKEN_VALUE,
            "3. controller redeem is not done properly - token holder does not lose tokens"
          );

          assert.equal(
            Number(finalSuply),
            Number(initialSuply) - DEFAULT_TOKEN_VALUE,
            "4. controller redeem is not done properly - token holder does not lose tokens"
          );
        });

        it("should emit *ControllerRedemptionByPartition* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'ControllerRedemptionByPartition');
          const decodedLog = logs.decode(SecurityToken, 'ControllerRedemptionByPartition', encodedLogs);

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[1],
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce - 1
            }
          );

          const expectedLog = {
            partition: DEFAULT_PARTITIONS[1],
            controller: CONTROLLER_1,
            tokenHolder: TOKEN_HOLDER[1],
            value: DEFAULT_TOKEN_VALUE.toString(),
            data: ZERO_32BYTES,
            controllerData: controllerData
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should remove partition if all its tokens are redeemed", async () => {
          await issueNewPartition(
            SecurityToken,
            NEW_PARTITION_3,
            DEFAULT_TOKEN_VALUE,
            TOKEN_HOLDER[0],
            ZERO_32BYTES
          );

          const initialTotalPartitions = await SecurityToken.totalPartitions();
          const initialTokenHolderPartitions = await SecurityToken.partitionsOf(TOKEN_HOLDER[0]);

          assert.equal(initialTotalPartitions.includes(NEW_PARTITION_3), true);
          assert.equal(initialTokenHolderPartitions.includes(NEW_PARTITION_3), true);

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: NEW_PARTITION_3,
              from: TOKEN_HOLDER[0],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await SecurityToken.controllerRedeemByPartition(
            NEW_PARTITION_3,
            TOKEN_HOLDER[0],
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1}
          );

          const finalTotalPartitions = await SecurityToken.totalPartitions();
          const finalTokenHolderPartitions = await SecurityToken.partitionsOf(TOKEN_HOLDER[0]);

          assert.equal(
            finalTotalPartitions.includes(NEW_PARTITION_3),
            false,
            "1. partition is not removed if all its tokens are redeemed"
          );
          assert.equal(
            finalTokenHolderPartitions.includes(NEW_PARTITION_3),
            false,
            "2. partition is not removed if all its tokens are redeemed"
          );
        });

        it("should emit *PartitionRemoved* event", async () => {
          const encodedLogs = await logs.get(Partitions, 'PartitionRemoved');
          const decodedLog = logs.decode(Partitions, 'PartitionRemoved', encodedLogs);

          const expectedLog = {
            partition: NEW_PARTITION_3
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if invalid certificate (nonce)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce + 1
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x76"]);
        });

        it("should revert if invalid certificate (params)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[2],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x75"]);
        });

        it("should revert if invalid certificate (token)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: Partitions.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x77"]);
        });

        it("should revert if invalid certificate (controller)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_1,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x78"]);
        });

        it("should revert if not enough value to redeem", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const balance = await SecurityToken.balanceOfByPartition(
            DEFAULT_PARTITIONS[0],
            TOKEN_HOLDER[1]
          );

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: Number(balance) + 1,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[1],
              Number(balance) + 1,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x52"]);
        });

        it("should revert if invalid partition to redeem", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: INVALID_PARTITION,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: 1,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              INVALID_PARTITION,
              TOKEN_HOLDER[1],
              1,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x59"]);
        });

        it("should revert if redeem 0 value", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: 0,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[1],
              0,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x58"]);
        });

        it("should revert if invalid token holder", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: DEFAULT_PARTITIONS[0],
              from: CONTROLLER_1,
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              CONTROLLER_1,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x56"]);
        });

        it("should revert if not a controller", async () => {
          await expect(
            SecurityToken.controllerRedeemByPartition(
              DEFAULT_PARTITIONS[0],
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[1]})
          ).to.eventually.be.rejectedWith(error["0x65"]);
        });
      });

      describe("#controllerRedeem - (controller)", () => {
        it("redeem value from first default partition only", async () => {
          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);
          const initialTotalSupply = await SecurityToken.totalSupply();
          const initialTotalSupplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const valueToRedeem = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]]/2;

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: valueToRedeem,
              nonce: nonce
            }
          );

          await SecurityToken.controllerRedeem(
            TOKEN_HOLDER[1],
            valueToRedeem,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1}
          );

          const finalTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);
          const finalTotalSupply = await SecurityToken.totalSupply();
          const finalTotalSupplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);

          //update expected values
          let expectedTokenHolderBalance = Object.assign({}, initialTokenHolderBalance);
          expectedTokenHolderBalance[DEFAULT_PARTITIONS[0]] -= valueToRedeem;

          assert.deepEqual(
            finalTokenHolderBalance,
            expectedTokenHolderBalance,
            "1. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupply,
            initialTotalSupply - valueToRedeem ,
            "2. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupplyByPartition,
            initialTotalSupplyByPartition - valueToRedeem ,
            "3. tokens are not redeem properly"
          )

          //restore initial state
          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[0],
            valueToRedeem,
            TOKEN_HOLDER[1],
            ZERO_32BYTES
          );
        });

        it("should emit *ControllerRedemption* event", async () => {
          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);
          const valueToRedeem = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]]/2

          const encodedLogs = await logs.get(SecurityToken, 'ControllerRedemption');
          const decodedLog = logs.decode(SecurityToken, 'ControllerRedemption', encodedLogs);

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: valueToRedeem,
              nonce: nonce - 1
            }
          );

          const expectedLog = {
            controller: CONTROLLER_1,
            tokenHolder: TOKEN_HOLDER[1],
            value: valueToRedeem.toString(),
            data: ZERO_32BYTES,
            controllerData: controllerData
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should force redemption from first and second default partitions even if lockup period has not expired yet (second default partition lockup expiration time is ### 1 October 2020 ###)", async () => {
          printCurrentDate();

          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);
          const initialTotalSupply = await SecurityToken.totalSupply();
          const initialTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const initialTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const valueToRedeemPartition0 = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]];
          const valueToRedeemPartition1 = initialTokenHolderBalance[DEFAULT_PARTITIONS[1]]/2;

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: valueToRedeemPartition0 + valueToRedeemPartition1,
              nonce: nonce
            }
          );

          await SecurityToken.controllerRedeem(
            TOKEN_HOLDER[1],
            valueToRedeemPartition0 + valueToRedeemPartition1,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1}
          );

          const finalTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);
          const finalTotalSupply = await SecurityToken.totalSupply();
          const finalTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const finalTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);

          //update expected values
          let expectedTokenHolderBalance = Object.assign({}, initialTokenHolderBalance);
          delete expectedTokenHolderBalance[DEFAULT_PARTITIONS[0]];
          expectedTokenHolderBalance[DEFAULT_PARTITIONS[1]] -= valueToRedeemPartition1;

          assert.deepEqual(
            finalTokenHolderBalance,
            expectedTokenHolderBalance,
            "1. tokens are not redeem properly"
          );

          assert.equal(
            finalTotalSupply,
            initialTotalSupply - valueToRedeemPartition0 - initialTokenHolderBalance[DEFAULT_PARTITIONS[1]]/2,
            "2. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupplyByPartition0,
            initialTotalSupplyByPartition0 - valueToRedeemPartition0 ,
            "3. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupplyByPartition1,
            initialTotalSupplyByPartition1 - valueToRedeemPartition1 ,
            "4. tokens are not redeem properly"
          )

          //restore initial state
          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[0],
            valueToRedeemPartition0,
            TOKEN_HOLDER[1],
            ZERO_32BYTES
          );

          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[1],
            valueToRedeemPartition1,
            TOKEN_HOLDER[1],
            ZERO_32BYTES
          );
        });

        it("redeem all the partitions with the exception of the one which is not default even if lockup period has not expired (third default partition lockup expiration time is ### 1 November 2020 ###)", async () => {
          await issueNewPartition(
            SecurityToken,
            NEW_PARTITION_4,
            DEFAULT_TOKEN_VALUE,
            TOKEN_HOLDER[1],
            ZERO_32BYTES
          );

          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);
          const initialTotalSupply = await SecurityToken.totalSupply();
          const initialTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const initialTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const initialTotalSupplyByPartition2 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[2]);
          const valueToRedeemPartition0 = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]];
          const valueToRedeemPartition1 = initialTokenHolderBalance[DEFAULT_PARTITIONS[1]];
          const valueToRedeemPartition2 = initialTokenHolderBalance[DEFAULT_PARTITIONS[2]];

          const defaultPartitions = await SecurityToken.getDefaultPartitions();

          let totalDefaultPartitionsValue = 0;

          defaultPartitions.forEach( partition => {
            totalDefaultPartitionsValue += initialTokenHolderBalance[partition];
          });

          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: totalDefaultPartitionsValue,
              nonce: nonce
            }
          );

          await SecurityToken.controllerRedeem(
            TOKEN_HOLDER[1],
            totalDefaultPartitionsValue,
            ZERO_32BYTES,
            controllerData,
            {from: CONTROLLER_1}
          );

          const finalTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[1]);
          const finalTotalSupply = await SecurityToken.totalSupply();
          const finalTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const finalTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const finalTotalSupplyByPartition2 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[2]);

          //update expected values
          let expectedTokenHolderBalance = Object.assign({}, initialTokenHolderBalance);
          defaultPartitions.forEach( partition => {
            delete expectedTokenHolderBalance[partition];
          });
          expectedTokenHolderBalance[NEW_PARTITION_4] = DEFAULT_TOKEN_VALUE;

          assert.deepEqual(
            finalTokenHolderBalance,
            expectedTokenHolderBalance,
            "1. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupply),
            initialTotalSupply -
            valueToRedeemPartition0 -
            valueToRedeemPartition1 -
            valueToRedeemPartition2,
            "2. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupplyByPartition0),
            initialTotalSupplyByPartition0 - valueToRedeemPartition0 ,
            "3. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupplyByPartition1),
            initialTotalSupplyByPartition1 - valueToRedeemPartition1 ,
            "4. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupplyByPartition2),
            initialTotalSupplyByPartition2 - valueToRedeemPartition2 ,
            "5. tokens are not redeem properly"
          )

          //restore initial state
          let i=0;
          await asyncForEach(defaultPartitions, async partition  => {
            await issueNewPartition(
              SecurityToken,
              partition,
              initialTokenHolderBalance[partition],
              TOKEN_HOLDER[1],
              ZERO_32BYTES
            );
            i++;
          });
        });

        it("should revert if invalid certificate (nonce)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce + 1
            }
          );

          await expect(
            SecurityToken.controllerRedeem(
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x76"]);
        });

        it("should revert if invalid certificate (params)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[2],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeem(
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x75"]);
        });

        it("should revert if invalid certificate (token)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: Partitions.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeem(
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x77"]);
        });

        it("should revert if invalid certificate (controller)", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_1,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeem(
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x78"]);
        });

        it("should revert if not enough value to redeem", async () => {
          const balance = await SecurityToken.balanceOf(TOKEN_HOLDER[1]);
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: Number(balance) + 1,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeem(
              TOKEN_HOLDER[1],
              Number(balance) + 1,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x52"]);
        });

        it("should revert if redeem 0 value", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: TOKEN_HOLDER[1],
              to: ZERO_ADDRESS,
              value: 0,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeem(
              TOKEN_HOLDER[1],
              0,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x58"]);
        });

        it("should revert if invalid token holder", async () => {
          const nonce = await SecurityToken.certificateTokenNonce();

          const controllerData = await getTransferControllerData(
            {
              controller: CONTROLLER_2,
              token: SecurityToken.address,
              partition: ZERO_32BYTES,
              from: CONTROLLER_1,
              to: ZERO_ADDRESS,
              value: DEFAULT_TOKEN_VALUE,
              nonce: nonce
            }
          );

          await expect(
            SecurityToken.controllerRedeem(
              CONTROLLER_1,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              controllerData,
              {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x56"]);
        });

        it("should revert if not a controller", async () => {
          await expect(
            SecurityToken.controllerRedeem(
              TOKEN_HOLDER[1],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[1]})
          ).to.eventually.be.rejectedWith(error["0x65"]);
        });
      });
    });

    describe("ERC1594", () => {
      describe("#issue - (issuer)", () => {
        it("should issue value to token holders (only to first default partition)", async () => {
          //Default partition for issuance
          const partition = DEFAULT_PARTITIONS[0];
          const tokenHolder = TOKEN_HOLDER[0];

          const initialBalanceOfByPartition = await SecurityToken.balanceOfByPartition(
            partition,
            tokenHolder
          );

          const initialBalanceOf = await SecurityToken.balanceOf(tokenHolder);

          const initialTotalSupplyByPartition = await SecurityToken.totalSupplyByPartition(partition);

          const initialTotalSupply = await SecurityToken.totalSupply();

          await SecurityToken.issue(
            tokenHolder,
            DEFAULT_TOKEN_VALUE,
            ZERO_32BYTES,
            {from: ISSUER_1}
          );

          const finalBalanceOfByPartition = await SecurityToken.balanceOfByPartition(
            partition,
            tokenHolder
          );

          const finalBalanceOf = await SecurityToken.balanceOf(tokenHolder);

          const finalTotalSupplyByPartition = await SecurityToken.totalSupplyByPartition(partition);

          const finalTotalSupply = await SecurityToken.totalSupply();



          assert.equal(
            Number(finalBalanceOfByPartition),
            Number(initialBalanceOfByPartition) + DEFAULT_TOKEN_VALUE,
            "tokens are not issued properly to token holders (balanceOfByPartition)"
          );

          assert.equal(
            Number(finalBalanceOf),
            Number(initialBalanceOf) + DEFAULT_TOKEN_VALUE,
            "tokens are not issued properly to token holders (balanceOf)"
          );

          assert.equal(
            Number(finalTotalSupplyByPartition),
            Number(initialTotalSupplyByPartition) + DEFAULT_TOKEN_VALUE,
            "tokens are not issued properly to token holders (totalSupplyByPartition)"
          );

          assert.equal(
            Number(finalTotalSupply),
            Number(initialTotalSupply) + DEFAULT_TOKEN_VALUE,
            "tokens are not issued properly to token holders (totalSupply)"
          );

        });

        it("should emit *Issued* event", async () => {
          const encodedLogs = await logs.get(SecurityToken, 'Issued');
          const decodedLog = logs.decode(SecurityToken, 'Issued', encodedLogs);

          const expectedLog = {
            operator: ISSUER_1,
            to: TOKEN_HOLDER[0],
            value: DEFAULT_TOKEN_VALUE.toString(),
            data: ZERO_32BYTES
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if not issuer", async () => {
          //Default partition for issuance
          const partition = DEFAULT_PARTITIONS[0];
          const tokenHolder = TOKEN_HOLDER[3];

          await expect(
            SecurityToken.issue(
              tokenHolder,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: tokenHolder})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should revert if value < issuance floor ($100k)", async () => {
          //Default partition for issuance
          const partition = DEFAULT_PARTITIONS[0];
          const tokenHolder = TOKEN_HOLDER[3];

          await expect(
            SecurityToken.issue(
              tokenHolder,
              seed.issuanceFloor[0]*10**TOKEN_DECIMALS - 1,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x61"]);
        });

        it("should revert if invalid granularity ($10k)", async () => {
          //Default partition for issuance
          const partition = DEFAULT_PARTITIONS[0];
          const tokenHolder = TOKEN_HOLDER[3];

          await expect(
            SecurityToken.issue(
              tokenHolder,
              100500000000,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x62"]);
        });

        it("should revert if invalid token holder", async () => {
          //Default partition for issuance
          const partition = DEFAULT_PARTITIONS[0];
          const tokenHolder = CONTROLLER_1;

          await expect(
            SecurityToken.issue(
              tokenHolder,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x57"]);
        });
      });

      describe("#redeemFrom - (issuer)", () => {
        it("redeem value from first default partition only (lockup period already expired)", async () => {
          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const initialTotalSupply = await SecurityToken.totalSupply();
          const initialTotalSupplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const valueToRedeem = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]]/2

          await SecurityToken.redeemFrom(
            TOKEN_HOLDER[2],
            //valueToRedeem,
            initialTokenHolderBalance[DEFAULT_PARTITIONS[0]],
            ZERO_32BYTES,
            {from: ISSUER_1}
          );

          const finalTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const finalTotalSupply = await SecurityToken.totalSupply();
          const finalTotalSupplyByPartition = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);

          //update expected values
          let expectedTokenHolderBalance = Object.assign({}, initialTokenHolderBalance);
          expectedTokenHolderBalance[DEFAULT_PARTITIONS[0]] -= valueToRedeem;

          assert.deepEqual(
            finalTokenHolderBalance,
            expectedTokenHolderBalance,
            "1. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupply,
            initialTotalSupply - valueToRedeem ,
            "2. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupplyByPartition,
            initialTotalSupplyByPartition - valueToRedeem ,
            "3. tokens are not redeem properly"
          )

          //restore initial state
          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[0],
            valueToRedeem,
            TOKEN_HOLDER[2],
            ZERO_32BYTES
          );
        });

        it("should emit *Redeemed* event", async () => {
          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const valueToRedeem = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]]/2;

          const encodedLogs = await logs.get(SecurityToken, 'Redeemed');
          const decodedLog = logs.decode(SecurityToken, 'Redeemed', encodedLogs);

          const expectedLog = {
            operator: ISSUER_1,
            from: TOKEN_HOLDER[2],
            value: valueToRedeem.toString(),
            data: ZERO_32BYTES
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("redeem value from first and second default partitions (lockup periods already expired)", async () => {
          //Time travel after lockup period
          const time = seed.lockupRedemptionTimestamps[1] - seed.lockupRedemptionTimestamps[0];
          timeTravelFuture(time);
          mineBlock();
          printCurrentDate();

          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const initialTotalSupply = await SecurityToken.totalSupply();
          const initialTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const initialTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const valueToRedeemPartition0 = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]];
          const valueToRedeemPartition1 = initialTokenHolderBalance[DEFAULT_PARTITIONS[1]]/2;

          await SecurityToken.redeemFrom(
            TOKEN_HOLDER[2],
            valueToRedeemPartition0 + valueToRedeemPartition1,
            ZERO_32BYTES,
            {from: ISSUER_1}
          );

          const finalTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const finalTotalSupply = await SecurityToken.totalSupply();
          const finalTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const finalTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);

          //update expected values
          let expectedTokenHolderBalance = Object.assign({}, initialTokenHolderBalance);
          delete expectedTokenHolderBalance[DEFAULT_PARTITIONS[0]];
          expectedTokenHolderBalance[DEFAULT_PARTITIONS[1]] -= valueToRedeemPartition1;

          assert.deepEqual(
            finalTokenHolderBalance,
            expectedTokenHolderBalance,
            "1. tokens are not redeem properly"
          );

          assert.equal(
            finalTotalSupply,
            initialTotalSupply - valueToRedeemPartition0 - initialTokenHolderBalance[DEFAULT_PARTITIONS[1]]/2,
            "2. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupplyByPartition0,
            initialTotalSupplyByPartition0 - valueToRedeemPartition0 ,
            "3. tokens are not redeem properly"
          )

          assert.equal(
            finalTotalSupplyByPartition1,
            initialTotalSupplyByPartition1 - valueToRedeemPartition1 ,
            "4. tokens are not redeem properly"
          )

          //restore initial state
          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[0],
            valueToRedeemPartition0,
            TOKEN_HOLDER[2],
            ZERO_32BYTES
          );

          await issueNewPartition(
            SecurityToken,
            DEFAULT_PARTITIONS[1],
            valueToRedeemPartition1,
            TOKEN_HOLDER[2],
            ZERO_32BYTES
          );
        });

        it("should revert if redeem all the partitions and one of the lockup periods did not expired (third default partition lockup expiration time is ### 1 November 2020 ###)", async () =>  {
          //Time travel to the past to 1 October 2020
          printCurrentDate();


          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const initialTotalSupply = await SecurityToken.totalSupply();
          const initialTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const initialTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const initialTotalSupplyByPartition2 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[2]);
          const valueToRedeemPartition0 = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]];
          const valueToRedeemPartition1 = initialTokenHolderBalance[DEFAULT_PARTITIONS[1]];
          const valueToRedeemPartition2 = initialTokenHolderBalance[DEFAULT_PARTITIONS[2]];

          const defaultPartitions = await SecurityToken.getDefaultPartitions();

          let totalDefaultPartitionsValue = 0;

          defaultPartitions.forEach( partition => {
            totalDefaultPartitionsValue += initialTokenHolderBalance[partition];
          });

          await expect(
            SecurityToken.redeemFrom(
              TOKEN_HOLDER[2],
              totalDefaultPartitionsValue,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x55"]);
        });

        it("redeem all the partitions with the exception of the one which is not default (Time travelled to ### 1 November 2020 ###)", async () => {
          //Time travel after lockup period
          const time = seed.lockupRedemptionTimestamps[2] - seed.lockupRedemptionTimestamps[1];
          timeTravelFuture(time);
          mineBlock();
          printCurrentDate();

          await issueNewPartition(
            SecurityToken,
            NEW_PARTITION_4,
            DEFAULT_TOKEN_VALUE,
            TOKEN_HOLDER[2],
            ZERO_32BYTES
          );

          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const initialTotalSupply = await SecurityToken.totalSupply();
          const initialTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const initialTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const initialTotalSupplyByPartition2 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[2]);
          const valueToRedeemPartition0 = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]];
          const valueToRedeemPartition1 = initialTokenHolderBalance[DEFAULT_PARTITIONS[1]];
          const valueToRedeemPartition2 = initialTokenHolderBalance[DEFAULT_PARTITIONS[2]];

          const defaultPartitions = await SecurityToken.getDefaultPartitions();

          let totalDefaultPartitionsValue = 0;

          defaultPartitions.forEach( partition => {
            totalDefaultPartitionsValue += initialTokenHolderBalance[partition];
          });

          await SecurityToken.redeemFrom(
            TOKEN_HOLDER[2],
            totalDefaultPartitionsValue,
            ZERO_32BYTES,
            {from: ISSUER_1}
          );

          const finalTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const finalTotalSupply = await SecurityToken.totalSupply();
          const finalTotalSupplyByPartition0 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[0]);
          const finalTotalSupplyByPartition1 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[1]);
          const finalTotalSupplyByPartition2 = await SecurityToken.totalSupplyByPartition(DEFAULT_PARTITIONS[2]);

          //update expected values
          let expectedTokenHolderBalance = Object.assign({}, initialTokenHolderBalance);
          defaultPartitions.forEach( partition => {
            delete expectedTokenHolderBalance[partition];
          });
          expectedTokenHolderBalance[NEW_PARTITION_4] = DEFAULT_TOKEN_VALUE;

          assert.deepEqual(
            finalTokenHolderBalance,
            expectedTokenHolderBalance,
            "1. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupply),
            initialTotalSupply -
            valueToRedeemPartition0 -
            valueToRedeemPartition1 -
            valueToRedeemPartition2,
            "2. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupplyByPartition0),
            initialTotalSupplyByPartition0 - valueToRedeemPartition0 ,
            "3. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupplyByPartition1),
            initialTotalSupplyByPartition1 - valueToRedeemPartition1 ,
            "4. tokens are not redeem properly"
          )

          assert.equal(
            Number(finalTotalSupplyByPartition2),
            initialTotalSupplyByPartition2 - valueToRedeemPartition2 ,
            "5. tokens are not redeem properly"
          )

          //restore initial state
          let i=0;
          await asyncForEach(defaultPartitions, async partition  => {
            await issueNewPartition(
              SecurityToken,
              partition,
              initialTokenHolderBalance[partition],
              TOKEN_HOLDER[2],
              ZERO_32BYTES
            );
            i++;
          });
        });

        it("should revert if not enough value to redeem", async () => {
          const balance2 = await SecurityToken.balanceOf(TOKEN_HOLDER[2]);

          await expect(
            SecurityToken.redeemFrom(
              TOKEN_HOLDER[2],
              Number(balance2) + 1,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x52"]);
        });

        it("should revert if redeem 0 value", async () => {
          await expect(
            SecurityToken.redeemFrom(
              TOKEN_HOLDER[2],
              0,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x58"]);
        });

        it("should revert if invalid token holder", async () => {
          await expect(
            SecurityToken.redeemFrom(
              CONTROLLER_1,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x56"]);
        });

        it("should revert if not a issuer", async () => {
          await expect(
            SecurityToken.redeemFrom(
              TOKEN_HOLDER[2],
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: TOKEN_HOLDER[2]})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("#renounceIssuance - (issuer)", () => {
        it("should revert if not issuer", async () => {
          await expect(
            SecurityToken.renounceIssuance({from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });

        it("should renounce issuance forever", async () => {
          await SecurityToken.renounceIssuance({from: ISSUER_1});

          const issuable = await SecurityToken.isIssuable();

          assert.isFalse(
            issuable,
            "token was not set to not issuable properly"
          );
        });

        it("should emit *IssuanceRenunciation* event", async () => {
          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const valueToRedeem = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]]/2;

          const encodedLogs = await logs.get(SecurityToken, 'IssuanceRenunciation');
          const decodedLog = logs.decode(SecurityToken, 'IssuanceRenunciation', encodedLogs);

          const expectedLog = {
            issuer: ISSUER_1
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should not issue if not issuable (#issue)", async () => {
          //Default partition for issuance
          const partition = DEFAULT_PARTITIONS[0];
          const tokenHolder = TOKEN_HOLDER[0];

          await expect(
            SecurityToken.issue(
              tokenHolder,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x63"]);
        });

        it("should not issue if not issuable (#issueByPartition)", async () => {
          const partition = DEFAULT_PARTITIONS[0];
          const tokenHolder = TOKEN_HOLDER[0];

          await expect(
            SecurityToken.issueByPartition(
              partition,
              tokenHolder,
              DEFAULT_TOKEN_VALUE,
              ZERO_32BYTES,
              {from: ISSUER_1}
            )
          ).to.eventually.be.rejectedWith(error["0x63"]);
        });
      });

      describe("#setRulesContract - (issuer)", () => {
        it("should point to a new rules contract", async () => {
          const oldRulesContract = await SecurityToken.rulesContract();
          this.oldRulesContract = oldRulesContract;

          await SecurityToken.setRulesContract(NEW_RULES_CONTRACT, {from: ISSUER_1});
          const newRulesContract = await SecurityToken.rulesContract();

          assert.equal(
            newRulesContract,
            NEW_RULES_CONTRACT,
            "new rules contract address was not set properly"
          );
        });

        it("should emit *RulesContractSet* event", async () => {
          const initialTokenHolderBalance = await getTokenHolderBalance(SecurityToken, TOKEN_HOLDER[2]);
          const valueToRedeem = initialTokenHolderBalance[DEFAULT_PARTITIONS[0]]/2;

          const encodedLogs = await logs.get(SecurityToken, 'RulesContractSet');
          const decodedLog = logs.decode(SecurityToken, 'RulesContractSet', encodedLogs);

          const expectedLog = {
            newContract: NEW_RULES_CONTRACT,
            oldContract: this.oldRulesContract
          }

          assert.deepEqual(decodedLog, expectedLog, "event was not emitted");
        });

        it("should revert if 0x00 address", async () => {
          await expect(
            SecurityToken.setRulesContract(ZERO_ADDRESS, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x68"]);
        });

        it("should revert if same address", async () => {
          await expect(
            SecurityToken.setRulesContract(NEW_RULES_CONTRACT, {from: ISSUER_1})
          ).to.eventually.be.rejectedWith(error["0x69"]);
        });

        it("should revert if not issuer", async () => {
          await expect(
            SecurityToken.setRulesContract(SecurityToken.address, {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("#unKYCtokenHolders - (issuer)", () => {
        it("should unKYC token holders", async () => {
          await SecurityToken.unKYCtokenHolders(TOKEN_HOLDER, {from: ISSUER_1});

          await asyncForEach(TOKEN_HOLDER, async (tokenHolder, i) => {
            let KYCed = await SecurityToken.isTokenHolderKYC(TOKEN_HOLDER[i]);
            assert.isFalse(KYCed, "token holders were not unKYC properly");
          });
        });

        it("should revert not issuer", async () => {
          await expect(
            SecurityToken.unKYCtokenHolders(TOKEN_HOLDER, {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });

      describe("#KYCtokenHolders - (issuer)", () => {
        it("should KYC token holders", async () => {
          await SecurityToken.KYCtokenHolders(TOKEN_HOLDER, {from: ISSUER_1});

          asyncForEach(TOKEN_HOLDER, async (tokenHolder, i) => {
            let KYCed = await SecurityToken.isTokenHolderKYC(TOKEN_HOLDER[i]);
            assert.isTrue(KYCed, "token holders were not unKYC properly");
          });
        });

        it("should revert not issuer", async () => {
          await expect(
            SecurityToken.KYCtokenHolders(TOKEN_HOLDER, {from: CONTROLLER_1})
          ).to.eventually.be.rejectedWith(error["0x66"]);
        });
      });
    });
  });
});
