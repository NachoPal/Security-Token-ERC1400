var SecurityToken = artifacts.require("./SecurityToken.sol");
var Rules = artifacts.require("./Rules.sol");
var Partitions = artifacts.require("./Partitions.sol");
var CertificateToken = artifacts.require("./CertificateToken.sol");
var CertificateController = artifacts.require("./CertificateController.sol");
var ERC1643 = artifacts.require("./ERC1643.sol");
var ERC1594 = artifacts.require("./ERC1594.sol");
var ERC1410 = artifacts.require("./ERC1410.sol");
var ERC1644 = artifacts.require("./ERC1644.sol");
var ERC20 = artifacts.require("./ERC20.sol");
var Utils = artifacts.require("./Utils.sol");
//const seedingDevelopment = require('../test/helpers/seed');
const seedingDevelopment = require('../test/helpers/seed_rinkeby');
const seedingRinkeby = require('../test/helpers/seed_rinkeby');

module.exports = function(deployer, network, accounts) {
  if(network != 'security_node') {
    let seeding = null
    if(network == 'development' || network == 'security_node') {
      seeding = seedingDevelopment
    } else {
      seeding = seedingRinkeby
    }

    const seed = seeding.run(accounts);

    deployer.link(Utils, SecurityToken);
    deployer.deploy(
      SecurityToken,
      seed.erc20details,
      Object.values(seed.controllers),
      Object.values(seed.documents),
      Object.values(seed.defaultPartitions),
      Object.values(seed.operators),
      [
        Rules.address,
        Partitions.address,
        CertificateToken.address,
        CertificateController.address,
        ERC1643.address,
        ERC1594.address,
        ERC1410.address,
        ERC1644.address,
        ERC20.address
      ]
    );
  }
};
