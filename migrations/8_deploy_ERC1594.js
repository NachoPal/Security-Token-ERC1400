var ERC1594 = artifacts.require("./ERC1594.sol");
var Utils = artifacts.require("./Utils.sol");

module.exports = function(deployer, network, accounts) {

  deployer.link(Utils, ERC1594);
  deployer.deploy(
    ERC1594
  );
};
