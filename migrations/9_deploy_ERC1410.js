var ERC1410 = artifacts.require("./ERC1410.sol");
var Utils = artifacts.require("./Utils.sol");

module.exports = function(deployer, network, accounts) {

  deployer.link(Utils, ERC1410);
  deployer.deploy(
    ERC1410
  );
};
