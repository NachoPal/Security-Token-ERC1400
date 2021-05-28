var ERC1644 = artifacts.require("./ERC1644.sol");
var Utils = artifacts.require("./Utils.sol");

module.exports = function(deployer, network, accounts) {

  deployer.link(Utils, ERC1644);
  deployer.deploy(
    ERC1644
  );
};
