var colors = require('colors');
const seeding = require('./helpers/seed');
const ProxyGenerator = require('./helpers/proxy_truffle_contract');

const SecurityTokenArtifacts = artifacts.require("SecurityToken");
const RulesArtifacts = artifacts.require("Rules");
const PartitionsArtifacts = artifacts.require("Partitions");
const CertificateTokenArtifacts = artifacts.require("CertificateToken");
const ERC20artifacts = artifacts.require("ERC20");
const ERC1410artifacts = artifacts.require("ERC1410");
const ERC1594artifacts = artifacts.require("ERC1594");
const ERC1643artifacts = artifacts.require("ERC1643");
const ERC1644artifacts = artifacts.require("ERC1644");


contract('Gas Consumption Tests', (ACCOUNTS) => {

  const seed = seeding.run(ACCOUNTS);

  const ISSUER_1 = ACCOUNTS[0];
  const ISSUER_2 = ACCOUNTS[ACCOUNTS.length-1];
  const CONTROLLER_1 = seed.controllers["1"];
  const CONTROLLER_2 = seed.controllers["2"];
  const CONTROLLER_3 = ACCOUNTS[ACCOUNTS.length-2];
  const OPERATOR_1 = seed.operators[0];
  const OPERATOR_2 = seed.operators[1];
  const TOKEN_HOLDER = Object.values(seed.tokenHolders);
  const DEFAULT_PARTITIONS = Object.values(seed.defaultPartitions);
  const DEFAULT_TOKEN_VALUE = seed.defaultTokenValue;

  const ZERO_ADDRESS = web3.utils.padRight("0x0", 40);
  const ZERO_32BYTES = web3.utils.padRight("0x0", 64);
  const NOW = Math.floor(Date.now()/1000);

  const GWEI_PER_ETH = 0.000000001;
  const LOW_GASPRICE = 2 * GWEI_PER_ETH;
  const AVERAGE_GASPRICE = 8 * GWEI_PER_ETH;
  const HIGH_GASPRICE = 20 * GWEI_PER_ETH;
  const USD_PER_ETH = 135;

  const displayUSDcost = (receipt) => {
    const lowCost = (receipt.gasUsed * LOW_GASPRICE * USD_PER_ETH).toFixed(3);
    const averageCost = (receipt.gasUsed * AVERAGE_GASPRICE * USD_PER_ETH).toFixed(3);
    const highCost = (receipt.gasUsed * HIGH_GASPRICE * USD_PER_ETH).toFixed(3);

    console.log(('\t$ ' + lowCost).green);
    console.log(('\t$ ' + averageCost).yellow);
    console.log(('\t$ ' + highCost).red);
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


  before("Contracts instances", async () => {
    SecurityToken = await SecurityTokenArtifacts.deployed();
    Rules = await RulesArtifacts.deployed();
    Partitions = await PartitionsArtifacts.deployed();
    CertificateToken = await CertificateTokenArtifacts.deployed();
    ERC1410 = await ERC1410artifacts.deployed();
    ERC1594 = await ERC1594artifacts.deployed();
    ERC1643 = await ERC1643artifacts.deployed();
    ERC1644 = await ERC1644artifacts.deployed();
    ERC20 = await ERC20artifacts.deployed();

    SecurityToken =  new ProxyGenerator(
      SecurityToken, [ERC1643, ERC1644, ERC20, ERC1410, ERC1594]
    );
  });

  describe("OPERATOR", () => {
    describe("KYC token holder - (#KYCtokenHolders)", () => {
      it("", async () => {
        const txHash = await SecurityToken.KYCtokenHolders(
          [TOKEN_HOLDER[0]], {from: ISSUER_1}
        );

        await SecurityToken.KYCtokenHolders(
          [TOKEN_HOLDER[1]], {from: ISSUER_1}
        );

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });

    describe("Issue token - (#issueByPartition)", () => {
      it("", async () => {
        const txHash = await SecurityToken.issueByPartition(
          DEFAULT_PARTITIONS[0],
          TOKEN_HOLDER[0],
          DEFAULT_TOKEN_VALUE,
          ZERO_32BYTES,
          {from: ISSUER_1}
        );

        await SecurityToken.issueByPartition(
          DEFAULT_PARTITIONS[0],
          TOKEN_HOLDER[1],
          DEFAULT_TOKEN_VALUE,
          ZERO_32BYTES,
          {from: ISSUER_1}
        );

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });

    describe("Issue token by batches - (#issueByPartitionAndBatches)", () => {
      it("", async () => {
        const issuances =
          [
            {
              partition: DEFAULT_PARTITIONS[0],
              tokenHolder: TOKEN_HOLDER[0],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              tokenHolder: TOKEN_HOLDER[0],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              tokenHolder: TOKEN_HOLDER[0],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              tokenHolder: TOKEN_HOLDER[0],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              tokenHolder: TOKEN_HOLDER[0],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
            }
        ];

        const txHash = await SecurityToken.issueByPartitionAndBatches(
          issuances,
          {from: ISSUER_1}
        );

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });

    describe("Transfer token - (#operatorTransferByPartition)", () => {
      it("", async () => {
        const txHash = await SecurityToken.operatorTransferByPartition(
          DEFAULT_PARTITIONS[0],
          TOKEN_HOLDER[0],
          TOKEN_HOLDER[1],
          DEFAULT_TOKEN_VALUE / 2,
          ZERO_32BYTES,
          ZERO_32BYTES
        , {from: OPERATOR_1});

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });

    describe("Transfer token by batches- (#operatorTransferByPartitionAndBatches)", () => {
      it("", async () => {
        const transfers =
          [
            {
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
              operatorData: ZERO_32BYTES
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
              operatorData: ZERO_32BYTES
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
              operatorData: ZERO_32BYTES
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
              operatorData: ZERO_32BYTES
            },
            {
              partition: DEFAULT_PARTITIONS[0],
              from: TOKEN_HOLDER[0],
              to: TOKEN_HOLDER[1],
              value: DEFAULT_TOKEN_VALUE,
              data: ZERO_32BYTES,
              operatorData: ZERO_32BYTES
            }
          ]

        const txHash = await SecurityToken.operatorTransferByPartitionAndBatches(
          transfers,
          {from: OPERATOR_1});

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });

    describe("Redeem token - (#operatorRedeemByPartition)", () => {
      const time = seed.lockupRedemptionTimestamps[0] - NOW + 24 * 60 * 60;
      timeTravelFuture(time);

      it("", async () => {
        const txHash = await SecurityToken.operatorRedeemByPartition(
          DEFAULT_PARTITIONS[0],
          TOKEN_HOLDER[0],
          DEFAULT_TOKEN_VALUE / 2,
          ZERO_32BYTES,
          {from: ISSUER_1});

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });

    describe("Redeem token by batches - (#operatorRedeemByPartitionAndBatches)", () => {
      const time = seed.lockupRedemptionTimestamps[0] - NOW + 24 * 60 * 60;
      timeTravelFuture(time);

      const redemptions =
        [
          {
            partition: DEFAULT_PARTITIONS[0],
            tokenHolder: TOKEN_HOLDER[1],
            value: DEFAULT_TOKEN_VALUE/100,
            data: ZERO_32BYTES,
          },
          {
            partition: DEFAULT_PARTITIONS[0],
            tokenHolder: TOKEN_HOLDER[1],
            value: DEFAULT_TOKEN_VALUE/100,
            data: ZERO_32BYTES,
          },
          {
            partition: DEFAULT_PARTITIONS[0],
            tokenHolder: TOKEN_HOLDER[1],
            value: DEFAULT_TOKEN_VALUE/100,
            data: ZERO_32BYTES,
          },
          {
            partition: DEFAULT_PARTITIONS[0],
            tokenHolder: TOKEN_HOLDER[1],
            value: DEFAULT_TOKEN_VALUE/100,
            data: ZERO_32BYTES,
          },
          {
            partition: DEFAULT_PARTITIONS[0],
            tokenHolder: TOKEN_HOLDER[1],
            value: DEFAULT_TOKEN_VALUE/100,
            data: ZERO_32BYTES,
          }
        ]

      it("", async () => {
        const txHash = await SecurityToken.operatorRedeemByPartitionAndBatches(
          redemptions,
          {from: ISSUER_1});

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });
  });

  describe("CONTROLLER", () => {
    describe("Force Transfer token - (#controllerTransferByPartition)", () => {
      it("", async () => {
        const nonce = await SecurityToken.certificateTokenNonce();

        const controllerData = await getTransferControllerData(
          {
            controller: CONTROLLER_2,
            token: SecurityToken.address,
            partition: DEFAULT_PARTITIONS[0],
            from: TOKEN_HOLDER[1],
            to: TOKEN_HOLDER[0],
            value: DEFAULT_TOKEN_VALUE / 2,
            nonce: nonce
          }
        );

        const txHash = await SecurityToken.controllerTransferByPartition(
          DEFAULT_PARTITIONS[0],
          TOKEN_HOLDER[1],
          TOKEN_HOLDER[0],
          DEFAULT_TOKEN_VALUE / 2,
          ZERO_32BYTES,
          controllerData
        , {from: CONTROLLER_1});

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });

    describe("Force Redeem token - (#controllerRedeemByPartition)", () => {
      it("", async () => {
        const nonce = await SecurityToken.certificateTokenNonce();

        const controllerData = await getTransferControllerData(
          {
            controller: CONTROLLER_2,
            token: SecurityToken.address,
            partition: DEFAULT_PARTITIONS[0],
            from: TOKEN_HOLDER[0],
            to: ZERO_ADDRESS,
            value: DEFAULT_TOKEN_VALUE / 2,
            nonce: nonce
          }
        );

        const txHash = await SecurityToken.controllerRedeemByPartition(
          DEFAULT_PARTITIONS[0],
          TOKEN_HOLDER[0],
          DEFAULT_TOKEN_VALUE / 2,
          ZERO_32BYTES,
          controllerData,
          {from: CONTROLLER_1});

        const receipt =  await web3.eth.getTransactionReceipt(txHash);

        displayUSDcost(receipt);
      });
    });
  });
});
